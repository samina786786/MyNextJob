import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeLocation, normalizeSearchQuery, parseFeedFilters } from '@/lib/jobs/feed/filters';
import { getFreshJobsPageFromClient } from '@/lib/jobs/feed/supabase-feed';

/**
 * Phase 5D carried-over hardening: a user query that consists only of SQL
 * LIKE / PostgREST metacharacters (`%%`, `%_`, `**`, `__`, `\`, etc.)
 * must never become an `ILIKE '%%'` predicate that matches every row.
 *
 * Two layers of defense:
 *   1. The URL parser (`normalizeSearchQuery` / `normalizeLocation`)
 *      returns `null`, which drops `q` / `location` from the canonical
 *      filter object — no cache key contamination, no preflight, no
 *      ILIKE emitted.
 *   2. The repository (`applyFilters`) checks the sanitized stem before
 *      building each pattern and forces `id IS NULL` (zero rows) when a
 *      caller ever hands us a metacharacter-only value directly.
 */

type Call = { table: string; op: string; args: unknown[] };

function makeClient(companyIds: string[] = []) {
  const calls: Call[] = [];
  function chain(table: string) {
    const api: Record<string, unknown> = {};
    api.select = (s: string) => {
      calls.push({ table, op: 'select', args: [s] });
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      calls.push({ table, op: 'eq', args: [col, val] });
      return api;
    };
    api.gte = (col: string, val: string) => {
      calls.push({ table, op: 'gte', args: [col, val] });
      return api;
    };
    api.in = (col: string, val: readonly string[]) => {
      calls.push({ table, op: 'in', args: [col, [...val]] });
      return api;
    };
    api.or = (expr: string) => {
      calls.push({ table, op: 'or', args: [expr] });
      return api;
    };
    api.is = (col: string, value: null | boolean) => {
      calls.push({ table, op: 'is', args: [col, value] });
      return api;
    };
    api.order = (col: string, opts?: { ascending?: boolean }) => {
      calls.push({ table, op: 'order', args: [col, opts] });
      return api;
    };
    api.limit = (n: number) => {
      calls.push({ table, op: 'limit', args: [n] });
      return api;
    };
    api.ilike = (col: string, pattern: string) => {
      calls.push({ table, op: 'ilike', args: [col, pattern] });
      return api;
    };
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

describe('parser gate: metacharacter-only queries are rejected', () => {
  it.each([['%%'], ['%_'], ['**'], ['__'], ['\\'], ['\\%_'], ['%%%'], ['(*)']])(
    'normalizeSearchQuery(%j) → null',
    (input) => {
      expect(normalizeSearchQuery(input)).toBeNull();
    },
  );

  it.each([['%'], ['_'], ['*'], ['%%'], ['**'], ['__'], ['\\'], [',,,'], ['()']])(
    'normalizeLocation(%j) → null',
    (input) => {
      expect(normalizeLocation(input)).toBeNull();
    },
  );

  it('preserves legitimate punctuation queries', () => {
    for (const query of ['C++', '.NET', 'Node.js', 'React Native', 'São Paulo', '東京', '---']) {
      expect(normalizeSearchQuery(query), query).toBe(query);
    }
  });

  it('URL grammar: q=%25%25 (%%) is dropped from parsed filters', () => {
    const filters = parseFeedFilters(new URLSearchParams('q=%25%25'));
    expect(filters.q).toBeNull();
  });

  it('URL grammar: location=%25_%25 (%_%) is dropped from parsed filters', () => {
    const filters = parseFeedFilters(
      new URLSearchParams('location=%25_%25'),
    );
    expect(filters.location).toBeNull();
  });
});

describe('repository gate: never emit ILIKE %% when a metacharacter-only filter sneaks through', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');

  it('forces zero rows via id IS NULL when q sanitizes to empty and no companies match', async () => {
    const { client, calls } = makeClient([]);
    await getFreshJobsPageFromClient(client, {
      // Bypass the URL parser — hand a metacharacter-only q directly to the
      // repository. This can only happen from a test or a direct code path;
      // the app-facing URL parser rejects it. We still expect no runaway match.
      filters: {
        q: '%%',
        work: [],
        employment: [],
        location: null,
        age: 30,
      },
      now,
    });
    const jobsOrs = calls.filter((c) => c.table === 'jobs' && c.op === 'or');
    // No OR predicate for q is emitted.
    expect(jobsOrs.some((c) => (c.args[0] as string).includes('title.ilike'))).toBe(false);
    // A deterministic zero-match sentinel is used instead.
    expect(calls.some((c) => c.table === 'jobs' && c.op === 'is' && c.args[0] === 'id')).toBe(true);
  });

  it('forces zero rows when location sanitizes to empty', async () => {
    const { client, calls } = makeClient();
    await getFreshJobsPageFromClient(client, {
      filters: {
        q: null,
        work: [],
        employment: [],
        location: '%%',
        age: 30,
      },
      now,
    });
    const jobsOrs = calls.filter((c) => c.table === 'jobs' && c.op === 'or');
    expect(jobsOrs.some((c) => (c.args[0] as string).includes('location_text.ilike'))).toBe(false);
    expect(calls.some((c) => c.table === 'jobs' && c.op === 'is' && c.args[0] === 'id')).toBe(true);
  });

  it('keeps the companies preflight silent for a metacharacter-only q', async () => {
    const { client, calls } = makeClient(['id-1']);
    await getFreshJobsPageFromClient(client, {
      filters: { q: '\\', work: [], employment: [], location: null, age: 30 },
      now,
    });
    // No .ilike() on the companies table.
    expect(calls.some((c) => c.table === 'companies' && c.op === 'ilike')).toBe(false);
  });
});
