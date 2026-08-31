import { describe, expect, it } from 'vitest';

import { AshbyAdapter } from '@/lib/jobs/adapters/ashby';
import { AdapterFetchError } from '@/lib/jobs/errors';

import {
  ASHBY_JOB_ID,
  ASHBY_SOURCE_ID,
  ashbyBoardFixture,
  ashbyJobFixture,
  mockAshbyFetch,
} from './fixtures/ashby-jobs';

const CONTEXT = {
  sourceId: ASHBY_SOURCE_ID,
  sourceName: 'Juniper Square',
  externalIdentifier: 'junipersquare',
  companyName: 'Juniper Square',
};

describe('Ashby adapter snapshot', () => {
  it('returns a complete one-request snapshot', async () => {
    const adapter = new AshbyAdapter({
      boardName: 'junipersquare',
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Staff Engineer' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(true);
    expect(result.jobs).toHaveLength(2);
    expect(result.metadata?.requestCount).toBe(1);
    expect(result.metadata?.pages).toBe(1);
    expect(result.metadata?.apiVersion).toBe('1');
    expect(result.metadata?.fetched).toBe(2);
    expect(result.metadata?.unlistedSkipped).toBe(0);
  });

  it('skips unlisted jobs without treating them as malformed', async () => {
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isListed: true }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isListed: false }),
          ashbyJobFixture({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', isListed: true }),
          ashbyJobFixture({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', isListed: false }),
          ashbyJobFixture({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.metadata?.fetched).toBe(5);
    expect(result.metadata?.listed).toBe(3);
    expect(result.metadata?.unlistedSkipped).toBe(2);
    expect(result.jobs).toHaveLength(3);
    expect(result.jobs.map((job) => job.source.externalId)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ]);
    expect(result.snapshotComplete).toBe(true);
  });

  it('throws on HTTP 404 instead of returning an empty complete snapshot', async () => {
    const adapter = new AshbyAdapter({
      boardName: 'missing-board',
      fetchImpl: mockAshbyFetch('{}', { status: 404 }),
    });
    await expect(
      adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'missing-board' }),
    ).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('fails the source when the wrapper is structurally invalid', async () => {
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch({ jobs: [] }),
    });
    await expect(adapter.fetchJobs(CONTEXT)).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('marks incomplete when the job safety cap truncates the board', async () => {
    const adapter = new AshbyAdapter({
      maxJobs: 1,
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(1);
    expect(result.snapshotComplete).toBe(false);
    expect(result.metadata?.capped).toBe(true);
  });

  it('retries a 200 HTML body that is not JSON', async () => {
    let calls = 0;
    const adapter = new AshbyAdapter({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('<html>oops</html>', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(ashbyBoardFixture([ashbyJobFixture()])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('requests the trusted host with includeCompensation and rejects path injection', async () => {
    const seen: string[] = [];
    const adapter = new AshbyAdapter({
      fetchImpl: async (input) => {
        seen.push(String(input));
        return new Response(JSON.stringify(ashbyBoardFixture([])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await adapter.fetchJobs(CONTEXT);
    expect(seen[0]).toBe(
      'https://api.ashbyhq.com/posting-api/job-board/junipersquare?includeCompensation=true',
    );
    await expect(
      adapter.fetchJobs({ ...CONTEXT, externalIdentifier: '../evil' }),
    ).rejects.toBeInstanceOf(AdapterFetchError);
    await expect(
      adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'https://evil.example' }),
    ).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('keeps one malformed listed job from failing the rest of the board', async () => {
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: '' }),
          ashbyJobFixture({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Backend Engineer' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(3);
    expect(result.metadata?.rejected).toBe(1);
    expect(result.snapshotComplete).toBe(true);
    expect(result.jobs[1]?.source.externalId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('does not send credentials to Ashby', async () => {
    let headers: HeadersInit | undefined;
    const adapter = new AshbyAdapter({
      fetchImpl: async (_input, init) => {
        headers = init?.headers;
        return new Response(JSON.stringify(ashbyBoardFixture([ashbyJobFixture({ id: ASHBY_JOB_ID })])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await adapter.fetchJobs(CONTEXT);
    const serialized = JSON.stringify(headers ?? {});
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/supabase/i);
  });
});
