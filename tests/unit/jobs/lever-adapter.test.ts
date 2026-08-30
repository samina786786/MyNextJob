import { describe, expect, it } from 'vitest';

import { LeverAdapter } from '@/lib/jobs/adapters/lever';
import { AdapterFetchError } from '@/lib/jobs/errors';

import { LEVER_SOURCE_ID, leverJobFixture, mockLeverPages } from './fixtures/lever-jobs';

const CONTEXT = {
  sourceId: LEVER_SOURCE_ID,
  sourceName: 'Drivetrain',
  externalIdentifier: 'drivetrain',
  companyName: 'Drivetrain',
  metadata: { lever_instance: 'global' as const },
};

describe('Lever adapter pagination', () => {
  it('marks complete when a full page is followed by a partial page', async () => {
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      pageSize: 2,
      fetchImpl: mockLeverPages([
        [leverJobFixture({ id: 'a' }), leverJobFixture({ id: 'b' })],
        [leverJobFixture({ id: 'c' })],
      ]),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(true);
    expect(result.jobs).toHaveLength(3);
    expect(result.metadata?.pages).toBe(2);
    expect(result.metadata?.instance).toBe('global');
  });

  it('requests an empty final page when every page is full', async () => {
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      pageSize: 2,
      fetchImpl: mockLeverPages([
        [leverJobFixture({ id: 'a' }), leverJobFixture({ id: 'b' })],
        [leverJobFixture({ id: 'c' }), leverJobFixture({ id: 'd' })],
        [],
      ]),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(true);
    expect(result.jobs).toHaveLength(4);
    expect(result.metadata?.pages).toBe(3);
    expect(result.metadata?.requestCount).toBe(3);
  });

  it('throws on HTTP failure instead of returning an empty complete snapshot', async () => {
    const adapter = new LeverAdapter({
      site: 'missing-site',
      fetchImpl: async () =>
        new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }),
    });
    await expect(
      adapter.fetchJobs({ ...CONTEXT, externalIdentifier: 'missing-site' }),
    ).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('marks incomplete when the max-page guard is reached', async () => {
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      pageSize: 1,
      maxPages: 2,
      fetchImpl: mockLeverPages([
        [leverJobFixture({ id: 'a' })],
        [leverJobFixture({ id: 'b' })],
        [leverJobFixture({ id: 'c' })],
      ]),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.snapshotComplete).toBe(false);
    expect(result.jobs).toHaveLength(2);
    expect(result.metadata?.capped).toBe(true);
  });

  it('dedupes repeated page ids and marks the snapshot incomplete', async () => {
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      pageSize: 2,
      fetchImpl: mockLeverPages([
        [leverJobFixture({ id: 'a' }), leverJobFixture({ id: 'b' })],
        [leverJobFixture({ id: 'a' }), leverJobFixture({ id: 'c' })],
      ]),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs.map((job) => job.source.externalId)).toEqual(['a', 'b', 'c']);
    expect(result.snapshotComplete).toBe(false);
    expect(result.metadata?.duplicateIds).toBe(1);
  });

  it('uses metadata.lever_instance and rejects arbitrary hosts', async () => {
    const seen: string[] = [];
    const adapter = new LeverAdapter({
      fetchImpl: async (input) => {
        seen.push(String(input));
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await adapter.fetchJobs({
      ...CONTEXT,
      metadata: { lever_instance: 'eu' },
    });
    expect(seen[0]).toContain('https://api.eu.lever.co/v0/postings/drivetrain');
    expect(seen[0]).toContain('mode=json');
    await expect(
      adapter.fetchJobs({
        ...CONTEXT,
        metadata: { lever_instance: 'https://evil.example' },
      }),
    ).rejects.toBeInstanceOf(AdapterFetchError);
  });
});
