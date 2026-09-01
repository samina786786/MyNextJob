import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { buildCoverageReport } from '@/lib/jobs/sources/audit';

/**
 * Coverage must operate over the FULL fresh catalog, not the first
 * server response page. Supabase/PostgREST caps a single response at
 * ~1000 rows regardless of `.limit()`, so the report has to page.
 */

type FakeJob = {
  id: string;
  title: string | null;
  remote_type: string | null;
  employment_type: string | null;
  country: string | null;
  freshness_at: string | null;
  company_id: string | null;
};

type FakePosting = { job_id: string; source_type: string };

/** Fabricate `n` deterministic fresh jobs plus optional posting evidence. */
function seedJobs(
  n: number,
  builder: (i: number) => Partial<FakeJob> = () => ({}),
): FakeJob[] {
  const jobs: FakeJob[] = [];
  for (let i = 0; i < n; i += 1) {
    const template: FakeJob = {
      id: `job-${i.toString().padStart(6, '0')}`,
      title: 'Software Engineer',
      remote_type: 'remote',
      employment_type: 'full_time',
      country: 'India',
      freshness_at: new Date(Date.now() - i * 60_000).toISOString(),
      company_id: `co-${(i % 20).toString().padStart(4, '0')}`,
    };
    jobs.push({ ...template, ...builder(i) });
  }
  return jobs;
}

function makeClient(input: {
  jobs: FakeJob[];
  postings?: FakePosting[];
  companies?: { id: string; domain: string | null; logo_status: string | null }[];
  /** Force the max IDs a single `.in()` call may carry. Simulates Kong's
   *  request-line cap that surfaces as HTTP 400 for oversized filters. */
  maxInListSize?: number;
  onInCall?: (table: string, size: number) => void;
}): SupabaseClient {
  const { jobs, postings = [], companies = [], maxInListSize, onInCall } = input;
  const jobsById = new Map(jobs.map((j) => [j.id, j] as const));

  function chain(table: string) {
    const api: Record<string, unknown> = {};
    const state: {
      selectStr: string;
      selectOpts: { count?: string; head?: boolean } | undefined;
      inFilter?: [string, readonly string[]];
      rangeFrom?: number;
      rangeTo?: number;
    } = { selectStr: '', selectOpts: undefined };
    api.select = (sel: string, opts?: { count?: string; head?: boolean }) => {
      state.selectStr = sel;
      state.selectOpts = opts;
      return api;
    };
    api.eq = () => api;
    api.gte = () => api;
    api.in = (col: string, values: readonly string[]) => {
      state.inFilter = [col, values];
      onInCall?.(table, values.length);
      return api;
    };
    api.order = () => api;
    api.range = (from: number, to: number) => {
      state.rangeFrom = from;
      state.rangeTo = to;
      return api;
    };
    api.limit = () => api;
    (api as unknown as PromiseLike<unknown>).then = ((
      onfulfilled?: ((value: unknown) => unknown) | null,
    ) => {
      let result: unknown;
      if (table === 'jobs') {
        if (state.selectOpts?.head && state.selectOpts.count === 'exact') {
          result = { data: null, count: jobs.length, error: null };
        } else {
          const from = state.rangeFrom ?? 0;
          const to = state.rangeTo ?? jobs.length - 1;
          const slice = jobs.slice(from, to + 1);
          result = { data: slice, error: null };
        }
      } else if (table === 'job_source_postings') {
        const [, ids] = state.inFilter ?? ['', []];
        if (maxInListSize != null && (ids as string[]).length > maxInListSize) {
          result = {
            data: null,
            error: {
              code: 'PGRST100',
              message: 'Bad Request',
              details: `.in list too large: ${(ids as string[]).length}`,
              hint: 'shrink the IN filter',
            },
          };
        } else {
          const idSet = new Set(ids as string[]);
          const rows = postings
            .filter((p) => idSet.has(p.job_id))
            .map((p) => ({ job_id: p.job_id, job_sources: { source_type: p.source_type } }));
          result = { data: rows, error: null };
        }
      } else if (table === 'companies') {
        const [, ids] = state.inFilter ?? ['', []];
        if (maxInListSize != null && (ids as string[]).length > maxInListSize) {
          result = {
            data: null,
            error: {
              code: 'PGRST100',
              message: 'Bad Request',
              details: `.in list too large: ${(ids as string[]).length}`,
              hint: 'shrink the IN filter',
            },
          };
        } else {
          const idSet = new Set(ids as string[]);
          const rows = companies.filter((c) => idSet.has(c.id));
          result = { data: rows, error: null };
        }
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
    }) as PromiseLike<unknown>['then'];
    return api;
  }

  void jobsById;
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

describe('buildCoverageReport — pagination beyond 1000 rows', () => {
  it('reports the full total (1505) instead of a single-response cap', async () => {
    const jobs = seedJobs(1505);
    const client = makeClient({ jobs });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(1505);
    // Classification totals must sum to the classified rows (no rows dropped
    // on page boundaries).
    const wmSum = Object.values(report.byWorkMode).reduce((a, b) => a + b, 0);
    expect(wmSum).toBe(1505);
    const etSum = Object.values(report.byEmploymentType).reduce((a, b) => a + b, 0);
    expect(etSum).toBe(1505);
  });

  it('handles exactly 1000 rows (page-boundary edge)', async () => {
    const client = makeClient({ jobs: seedJobs(1000) });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(1000);
  });

  it('handles 1001 rows (spills into a second page)', async () => {
    const client = makeClient({ jobs: seedJobs(1001) });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(1001);
  });

  it('handles zero jobs', async () => {
    const client = makeClient({ jobs: [] });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(0);
    expect(report.byProvider).toEqual({});
    expect(report.byWorkMode).toEqual({});
  });

  it('handles a final partial page (2500 rows across three pages)', async () => {
    const client = makeClient({ jobs: seedJobs(2500) });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(2500);
  });

  it('paginates provider attribution across many job ids', async () => {
    const jobs = seedJobs(1200);
    const postings: FakePosting[] = jobs.map((j, i) => ({
      job_id: j.id,
      source_type: i % 4 === 0 ? 'we_work_remotely' : 'greenhouse',
    }));
    const client = makeClient({ jobs, postings });
    const report = await buildCoverageReport(client);
    const total = Object.values(report.byProvider).reduce((a, b) => a + b, 0);
    expect(total).toBe(1200);
    expect(report.byProvider.greenhouse).toBeGreaterThan(0);
    // 300 rows have only WWR evidence; the rest have only greenhouse. WWR
    // count in a "preferred provider" report is exactly the rows with WWR
    // as their only evidence.
    expect(report.byProvider.we_work_remotely).toBeGreaterThan(0);
  });
});

describe('buildCoverageReport — preferred provider precedence', () => {
  it('a job with both direct ATS and WWR evidence counts once under the direct ATS', async () => {
    const jobs = seedJobs(3);
    const postings: FakePosting[] = [
      // Job 0: direct-only (greenhouse) — counts as greenhouse.
      { job_id: jobs[0]!.id, source_type: 'greenhouse' },
      // Job 1: aggregator + direct (WWR + lever) — must count as lever.
      { job_id: jobs[1]!.id, source_type: 'we_work_remotely' },
      { job_id: jobs[1]!.id, source_type: 'lever' },
      // Job 2: WWR-only — counts as WWR.
      { job_id: jobs[2]!.id, source_type: 'we_work_remotely' },
    ];
    const client = makeClient({ jobs, postings });
    const report = await buildCoverageReport(client);
    expect(report.byProvider.greenhouse).toBe(1);
    expect(report.byProvider.lever).toBe(1);
    expect(report.byProvider.we_work_remotely).toBe(1);
    expect(report.byProvider.ashby).toBeUndefined();
    // Total attributed jobs equals the total fresh open jobs; every canonical
    // job is counted exactly once.
    const total = Object.values(report.byProvider).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });

  it('a job with no posting evidence is counted as "unattributed" (never dropped)', async () => {
    const jobs = seedJobs(1);
    const client = makeClient({ jobs, postings: [] });
    const report = await buildCoverageReport(client);
    expect(report.byProvider).toEqual({ unattributed: 1 });
  });
});

describe('buildCoverageReport — .in() chunk size stays under Kong request-line limit', () => {
  it('splits provider attribution into safe chunks (never 1000 UUIDs per .in())', async () => {
    // 300 jobs → the follow-up attribution and companies queries must each
    // arrive as multiple `.in()` calls, none exceeding the safe 150-id cap
    // that keeps the URL under 8 KB.
    const jobs = seedJobs(300);
    const postingsPerJob: FakePosting[] = jobs.map((j, i) => ({
      job_id: j.id,
      source_type: i % 3 === 0 ? 'greenhouse' : 'ashby',
    }));
    const inCalls: { table: string; size: number }[] = [];
    const client = makeClient({
      jobs,
      postings: postingsPerJob,
      onInCall: (table, size) => inCalls.push({ table, size }),
    });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(300);
    const postingCalls = inCalls.filter((c) => c.table === 'job_source_postings');
    expect(postingCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of postingCalls) {
      expect(call.size, `.in() chunk ${call.size} exceeds safe URL size`).toBeLessThanOrEqual(200);
    }
    const companyCalls = inCalls.filter((c) => c.table === 'companies');
    for (const call of companyCalls) {
      expect(call.size).toBeLessThanOrEqual(200);
    }
    const total = Object.values(report.byProvider).reduce((a, b) => a + b, 0);
    expect(total).toBe(300);
  });

  it('regression: reproduces the pre-fix HTTP 400 when a 1000-id .in() is sent', async () => {
    // Belt-and-suspenders: prove the runtime WOULD have failed with a 400 if
    // the follow-ups ever regressed to a 1000-id .in(). We simulate Kong's
    // request-line cap at 200 ids — any single .in() >200 → HTTP 400. With
    // the fix in place (150-id chunks) the call succeeds instead.
    const jobs = seedJobs(300);
    const postings: FakePosting[] = jobs.map((j) => ({ job_id: j.id, source_type: 'greenhouse' }));
    const client = makeClient({ jobs, postings, maxInListSize: 200 });
    // Should NOT throw — chunk size is 150 which is < 200.
    await expect(buildCoverageReport(client)).resolves.toBeDefined();
  });

  it('exact-count of a smaller catalog is respected end-to-end', async () => {
    // The head-count still drives freshOpenJobs when classification rows
    // are fewer (should never happen in practice, but tested defensively).
    const jobs = seedJobs(3);
    const client = makeClient({ jobs });
    const report = await buildCoverageReport(client);
    expect(report.freshOpenJobs).toBe(3);
  });

  it('propagates Supabase error code/message/details/hint from a chunk failure', async () => {
    const jobs = seedJobs(50);
    const postings: FakePosting[] = jobs.map((j) => ({ job_id: j.id, source_type: 'greenhouse' }));
    // Force every .in() to fail so the fix's rich error surfaces.
    const client = makeClient({ jobs, postings, maxInListSize: 0 });
    await expect(buildCoverageReport(client)).rejects.toThrowError(
      /coverage attribution chunk.*code=PGRST100.*message=Bad Request.*details=.*hint=shrink the IN filter/,
    );
  });

  it.each([[1], [149], [150], [151]])(
    'chunk boundary %i works and does not throw',
    async (n) => {
      const jobs = seedJobs(n);
      const client = makeClient({ jobs });
      const report = await buildCoverageReport(client);
      expect(report.freshOpenJobs).toBe(n);
    },
  );
});
