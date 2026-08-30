import { describe, expect, it } from 'vitest';

import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
import { AdapterFetchError } from '@/lib/jobs/errors';

import {
  GREENHOUSE_SOURCE_ID,
  greenhouseJobFixture,
  greenhouseListFixture,
  mockGreenhouseFetch,
} from './fixtures/greenhouse-jobs';

const CONTEXT = {
  sourceId: GREENHOUSE_SOURCE_ID,
  sourceName: 'Dscout',
  externalIdentifier: 'dscout',
  companyName: 'Dscout',
};

describe('Greenhouse adapter fetch', () => {
  it('marks the snapshot complete when meta.total matches jobs.length', async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture(), greenhouseJobFixture({ id: 2 })], 2),
      }),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(true);
    expect(result.jobs).toHaveLength(2);
  });

  it('marks the snapshot incomplete when meta.total mismatches', async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture()], 99),
      }),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(false);
    expect(result.jobs).toHaveLength(1);
  });

  it('throws on HTTP failure instead of returning an empty complete snapshot', async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: 'missing-board',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({ jobsStatus: 404, jobsBody: { message: 'Not Found' } }),
    });
    await expect(adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'missing-board' })).rejects.toBeInstanceOf(
      AdapterFetchError,
    );
    await expect(adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'missing-board' })).rejects.toThrow(
      /not found/i,
    );
  });

  it('retries a 429 once when Retry-After is present', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0', 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(greenhouseListFixture([greenhouseJobFixture()], 1)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl,
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('does not retry 400-class failures', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('nope', { status: 400, headers: { 'content-type': 'application/json' } });
    };
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl,
    });
    await expect(adapter.fetchJobs(CONTEXT)).rejects.toBeInstanceOf(AdapterFetchError);
    expect(calls).toBe(1);
  });

  it('reads the board token from job source context, not hard-coded companies', async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response(JSON.stringify(greenhouseListFixture([greenhouseJobFixture()], 1)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const adapter = new GreenhouseAdapter({ fetchBoard: false, fetchImpl });
    await adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'alphasense' });
    expect(seen[0]).toContain('/boards/alphasense/jobs?content=true');
    expect(seen[0]).toContain('https://boards-api.greenhouse.io');
  });

  it('rejects an attacker-controlled token that would change the hostname', async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: '../evil.example',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({}),
    });
    await expect(adapter.fetchJobs(CONTEXT)).rejects.toBeInstanceOf(AdapterFetchError);
  });
});
