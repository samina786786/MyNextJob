import { describe, expect, it } from 'vitest';

import { AshbyAdapter } from '@/lib/jobs/adapters/ashby';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

import { ashbyBoardFixture, ashbyJobFixture, mockAshbyFetch } from './fixtures/ashby-jobs';

async function seededStore() {
  const store = new MemoryJobStore();
  const company = await store.insertCompany({
    name: 'Juniper Square',
    nameKey: normalizeCompanyName('Juniper Square'),
    slug: 'junipersquare',
    domain: 'junipersquare.com',
  });
  const source = await store.insertJobSource({
    name: 'Juniper Square',
    sourceType: 'ashby',
    externalIdentifier: 'junipersquare',
    companyId: company.id,
  });
  return { store, source };
}

describe('Ashby adapter → Job Engine → MemoryJobStore', () => {
  it('creates jobs on first sync and stays idempotent on repeat', async () => {
    const { store, source } = await seededStore();
    const adapter = new AshbyAdapter({
      boardName: 'junipersquare',
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Frontend Engineer — India',
            publishedAt: '2026-08-30T10:00:00Z',
          }),
          ashbyJobFixture({
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            title: 'Backend Engineer — India',
            workplaceType: 'Hybrid',
            isRemote: false,
            employmentType: 'Contract',
          }),
        ]),
      ),
    });

    const first = await syncJobSource(store, source.id, adapter);
    expect(first.status).toBe('succeeded');
    expect(first.metrics.snapshotComplete).toBe(true);
    expect(first.metrics.canonicalJobsCreated).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.canonicalJobsCreated).toBe(0);
    expect(second.metrics.unchanged).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);

    const published = store.listJobs().find((job) => job.externalId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(published?.publishedAt?.toISOString()).toBe('2026-08-30T10:00:00.000Z');
    expect(published?.discoveredAt).not.toEqual(published?.publishedAt);
    expect(store.listJobs().find((job) => job.externalId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.remoteType).toBe(
      'hybrid',
    );
    expect(
      store.listJobs().find((job) => job.externalId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.employmentType,
    ).toBe('contract');
  });

  it('does not persist unlisted jobs', async () => {
    const { store, source } = await seededStore();
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Frontend Engineer',
            isListed: true,
          }),
          ashbyJobFixture({
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            title: 'Unlisted Engineer',
            isListed: false,
          }),
          ashbyJobFixture({
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            title: 'Backend Engineer',
            isListed: true,
          }),
        ]),
      ),
    });
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.metrics.accepted).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings().map((row) => row.externalId)).not.toContain(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    expect(result.metrics.snapshotComplete).toBe(true);
  });

  it('rejects one malformed job and still ingests the valid ones', async () => {
    const { store, source } = await seededStore();
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Valid Engineer' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: '' }),
          ashbyJobFixture({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Another Valid Engineer' }),
        ]),
      ),
    });
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.metrics.fetched).toBe(3);
    expect(result.metrics.accepted).toBe(2);
    expect(result.metrics.rejected).toBe(1);
    expect(store.listJobs()).toHaveLength(2);
  });

  it('sanitizes unsafe HTML before persistence', async () => {
    const { store, source } = await seededStore();
    const adapter = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({
            descriptionHtml:
              '<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>',
          }),
        ]),
      ),
    });
    await syncJobSource(store, source.id, adapter);
    const job = store.listJobs()[0];
    expect(job?.descriptionHtml).toContain('<p>Safe</p>');
    expect(job?.descriptionHtml).not.toContain('script');
    expect(job?.descriptionHtml).not.toContain('javascript:');
    expect(job?.descriptionHtml).not.toContain('onerror');
  });

  it('counts a complete-snapshot omission toward generic miss lifecycle', async () => {
    const { store, source } = await seededStore();
    const first = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ]),
      ),
    });
    await syncJobSource(store, source.id, first);

    const second = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })]),
      ),
    });
    await syncJobSource(store, source.id, second);
    const missed = store.listPostings().find((row) => row.externalId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(missed?.consecutiveMisses).toBe(1);
  });

  it('does not increment missing-job lifecycle when the snapshot is incomplete', async () => {
    const { store, source } = await seededStore();
    const complete = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ]),
      ),
    });
    await syncJobSource(store, source.id, complete);

    const incomplete = new AshbyAdapter({
      maxJobs: 1,
      fetchImpl: mockAshbyFetch(
        ashbyBoardFixture([
          ashbyJobFixture({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
          ashbyJobFixture({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ]),
      ),
    });
    await syncJobSource(store, source.id, incomplete);
    const missed = store.listPostings().find((row) => row.externalId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(missed?.consecutiveMisses).toBe(0);
    expect(missed?.active).toBe(true);
  });

  it('fails the run on a 404 board and does not close existing jobs', async () => {
    const { store, source } = await seededStore();
    const ok = new AshbyAdapter({
      fetchImpl: mockAshbyFetch(ashbyBoardFixture([ashbyJobFixture()])),
    });
    await syncJobSource(store, source.id, ok);

    const missing = new AshbyAdapter({
      fetchImpl: mockAshbyFetch('{}', { status: 404 }),
    });
    const failed = await syncJobSource(store, source.id, missing);
    expect(failed.status).toBe('failed');
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.listPostings()[0]?.consecutiveMisses).toBe(0);
  });
});
