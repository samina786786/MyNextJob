import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { EMPTY_FEED_FILTERS, parseFeedFilters } from '@/lib/jobs/feed/filters';
import { getFreshJobsPageFromClient } from '@/lib/jobs/feed/supabase-feed';

type Call = { table: string; op: string; args: unknown[] };

function makeClient(companyIds: string[] = []) {
  const calls: Call[] = [];
  function chain(table: string) {
    const state = {
      selectStr: '',
      eqPairs: [] as [string, unknown][],
      gtePairs: [] as [string, string][],
      inPairs: [] as [string, readonly string[]][],
      orExprs: [] as string[],
      orderPairs: [] as { col: string; ascending: boolean }[],
      limitN: 0,
      likePairs: [] as [string, string][],
    };
    const api: Record<string, unknown> = {};
    api.select = (s: string) => {
      state.selectStr = s;
      calls.push({ table, op: 'select', args: [s] });
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      state.eqPairs.push([col, val]);
      calls.push({ table, op: 'eq', args: [col, val] });
      return api;
    };
    api.gte = (col: string, val: string) => {
      state.gtePairs.push([col, val]);
      calls.push({ table, op: 'gte', args: [col, val] });
      return api;
    };
    api.in = (col: string, val: readonly string[]) => {
      state.inPairs.push([col, val]);
      calls.push({ table, op: 'in', args: [col, [...val]] });
      return api;
    };
    api.or = (expr: string) => {
      state.orExprs.push(expr);
      calls.push({ table, op: 'or', args: [expr] });
      return api;
    };
    api.order = (col: string, opts?: { ascending?: boolean }) => {
      state.orderPairs.push({ col, ascending: opts?.ascending ?? true });
      calls.push({ table, op: 'order', args: [col, opts] });
      return api;
    };
    api.limit = (n: number) => {
      state.limitN = n;
      calls.push({ table, op: 'limit', args: [n] });
      return api;
    };
    api.ilike = (col: string, pattern: string) => {
      state.likePairs.push([col, pattern]);
      calls.push({ table, op: 'ilike', args: [col, pattern] });
      return api;
    };
    // The primary jobs query and the companies preflight are both awaited
    // after their terminal chain call. Resolve with 0 rows for jobs and
    // with the injected id list for companies.
    (api as unknown as PromiseLike<unknown>).then = ((
      onfulfilled?: ((value: unknown) => unknown) | null,
    ) => {
      const result =
        table === 'companies'
          ? { data: companyIds.map((id) => ({ id })), error: null }
          : { data: [], error: null };
      return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
    }) as PromiseLike<unknown>['then'];
    return api;
  }
  const client = {
    from: (table: string) => chain(table),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const NOW = new Date('2026-09-01T00:00:00.000Z');

describe('filtered feed query construction', () => {
  it('applies work / employment / age / location filters as PostgREST predicates', async () => {
    const filters = parseFeedFilters(
      new URLSearchParams('work=remote,hybrid&employment=full_time&location=India&age=7'),
    );
    const { client, calls } = makeClient();
    await getFreshJobsPageFromClient(client, { filters, now: NOW });

    const jobsCalls = calls.filter((c) => c.table === 'jobs');
    const gte = jobsCalls.find((c) => c.op === 'gte');
    expect(gte?.args[0]).toBe('freshness_at');
    // 7-day cutoff instead of the default 30
    const cutoff = new Date(gte?.args[1] as string).getTime();
    const expected = NOW.getTime() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(1000);

    const inRemote = jobsCalls.find((c) => c.op === 'in' && c.args[0] === 'remote_type');
    expect(inRemote?.args[1]).toEqual(['hybrid', 'remote']);
    const inEmployment = jobsCalls.find((c) => c.op === 'in' && c.args[0] === 'employment_type');
    expect(inEmployment?.args[1]).toEqual(['full_time']);

    const orExprs = jobsCalls.filter((c) => c.op === 'or').map((c) => c.args[0] as string);
    // Location OR expression must contain each field with the escaped substring.
    expect(orExprs.some((expr) => expr.includes('location_text.ilike.*India*'))).toBe(true);
    expect(orExprs.some((expr) => expr.includes('city.ilike.*India*'))).toBe(true);
    expect(orExprs.some((expr) => expr.includes('country.ilike.*India*'))).toBe(true);
  });

  it('escapes both PostgREST OR grammar and SQL LIKE metacharacters', async () => {
    // Input `react, *(native)%_\` — every listed metacharacter appears in q.
    const filters = parseFeedFilters(
      new URLSearchParams('q=react%2C%20*%28native%29%25_%5C'),
    );
    const { client, calls } = makeClient([]);
    await getFreshJobsPageFromClient(client, { filters, now: NOW });
    const orExprs = calls
      .filter((c) => c.table === 'jobs' && c.op === 'or')
      .map((c) => c.args[0] as string);
    for (const expr of orExprs) {
      const match = /title\.ilike\.\*(.*)\*/.exec(expr);
      if (!match) continue;
      const value = match[1] ?? '';
      // Neither the OR grammar (`,`, `(`, `)`, `*`) nor the SQL LIKE
      // grammar (`%`, `_`, `\`) can appear bare inside the pattern.
      expect(value).not.toMatch(/[%_\\,()*]/);
    }
  });

  it('applies the same LIKE escape on the companies preflight', async () => {
    const filters = parseFeedFilters(new URLSearchParams('q=%25db%5F'));
    const { client, calls } = makeClient(['id-1']);
    await getFreshJobsPageFromClient(client, { filters, now: NOW });
    const companyIlike = calls.find((c) => c.table === 'companies' && c.op === 'ilike');
    const pattern = companyIlike?.args[1] as string;
    // The pattern surrounds the value with `%` — the value itself must not
    // contain any additional wildcards.
    expect(pattern.startsWith('%')).toBe(true);
    expect(pattern.endsWith('%')).toBe(true);
    const inner = pattern.slice(1, -1);
    expect(inner).not.toMatch(/[%_\\]/);
  });

  it('applies the LIKE escape on the location OR expression', async () => {
    const filters = parseFeedFilters(
      new URLSearchParams(`location=${encodeURIComponent('%India_')}`),
    );
    const { client, calls } = makeClient();
    await getFreshJobsPageFromClient(client, { filters, now: NOW });
    const locationOr = calls
      .filter((c) => c.table === 'jobs' && c.op === 'or')
      .map((c) => c.args[0] as string)
      .find((expr) => expr.startsWith('location_text.ilike.'));
    expect(locationOr).toBeDefined();
    // Assert only against the user-controlled patterns, not the column
    // names (`location_text` legitimately contains an underscore).
    for (const leg of locationOr!.split(',')) {
      const match = /\.ilike\.\*(.*)\*/.exec(leg);
      if (!match) continue;
      expect(match[1] ?? '').not.toMatch(/[%_\\]/);
    }
    // The searchable stem "India" survives.
    expect(locationOr!).toContain('India');
  });

  it('runs a company-name preflight when q is present', async () => {
    const filters = parseFeedFilters(new URLSearchParams('q=dscout'));
    const { client, calls } = makeClient(['a1', 'a2']);
    await getFreshJobsPageFromClient(client, { filters, now: NOW });
    const companyIlike = calls.find((c) => c.table === 'companies' && c.op === 'ilike');
    expect(companyIlike?.args[0]).toBe('name');
    expect(companyIlike?.args[1]).toBe('%dscout%');
    const jobsOrs = calls
      .filter((c) => c.table === 'jobs' && c.op === 'or')
      .map((c) => c.args[0] as string);
    expect(jobsOrs.some((expr) => expr.includes('company_id.in.(a1,a2)'))).toBe(true);
  });

  it('does not apply q clauses when the query is absent', async () => {
    const { client, calls } = makeClient();
    await getFreshJobsPageFromClient(client, {
      filters: EMPTY_FEED_FILTERS,
      now: NOW,
    });
    expect(calls.filter((c) => c.table === 'companies' && c.op === 'ilike')).toHaveLength(0);
    const jobsOrs = calls.filter((c) => c.table === 'jobs' && c.op === 'or');
    expect(jobsOrs.some((c) => (c.args[0] as string).startsWith('title.ilike'))).toBe(false);
  });

  it('keeps the freshness/id keyset order on every call', async () => {
    const { client, calls } = makeClient();
    await getFreshJobsPageFromClient(client, { now: NOW });
    const jobsOrder = calls.filter((c) => c.table === 'jobs' && c.op === 'order');
    expect(jobsOrder.map((c) => c.args[0])).toEqual(['freshness_at', 'id']);
    expect(jobsOrder.every((c) => (c.args[1] as { ascending: boolean }).ascending === false)).toBe(
      true,
    );
  });
});
