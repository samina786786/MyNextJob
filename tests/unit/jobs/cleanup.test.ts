import { describe, expect, it } from 'vitest';

import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { acmeFrontendJob } from '@/lib/jobs/adapters/synthetic';
import { cleanupStaleJobs, memoryCleanupCatalog } from '@/lib/jobs/cleanup/stale-jobs';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

const NOW = new Date('2026-08-31T12:00:00.000Z');

async function addJob(
  store: MemoryJobStore,
  args: { externalId: string; publishedAt: string; title?: string },
) {
  const sources = await store.listJobSources();
  const source = sources[0]!;
  const job = acmeFrontendJob({
    externalId: args.externalId,
    title: args.title ?? args.externalId,
    publishedAt: args.publishedAt,
  });
  job.source.sourceId = source.id;
  return persistNormalizedJob(store, job);
}

describe('stale cleanup', () => {
  it('deletes stale unreferenced jobs and keeps fresh ones', async () => {
    const store = new MemoryJobStore(() => NOW);
    await store.insertJobSource({ name: 'Feed' });
    const fresh = await addJob(store, {
      externalId: 'fresh',
      publishedAt: '2026-08-30T00:00:00.000Z',
    });
    const stale = await addJob(store, {
      externalId: 'stale',
      publishedAt: '2026-08-20T00:00:00.000Z',
    });
    await store.updateCanonicalJob(stale.jobId, {
      publishedAt: new Date('2023-05-01T00:00:00.000Z'),
      discoveredAt: new Date('2023-05-01T00:00:00.000Z'),
    });
    const stalePosting = store.listPostings().find((posting) => posting.jobId === stale.jobId);
    if (stalePosting) {
      await store.updateSourcePosting(stalePosting.id, {
        publishedAt: new Date('2023-05-01T00:00:00.000Z'),
      });
    }

    const dry = await cleanupStaleJobs(memoryCleanupCatalog(store), { apply: false });
    expect(dry.eligibleForDeletion).toBe(1);
    expect(dry.deleted).toBe(0);
    expect(store.listJobs()).toHaveLength(2);

    const live = await cleanupStaleJobs(memoryCleanupCatalog(store), { apply: true });
    expect(live.deleted).toBe(1);
    expect(store.listJobs().map((job) => job.id)).toEqual([fresh.jobId]);
    expect(store.listPostings().every((posting) => posting.jobId === fresh.jobId)).toBe(true);

    const again = await cleanupStaleJobs(memoryCleanupCatalog(store), { apply: true });
    expect(again.eligibleForDeletion).toBe(0);
    expect(again.deleted).toBe(0);
  });

  it('preserves stale jobs referenced by saved_jobs or applications', async () => {
    const store = new MemoryJobStore(() => NOW);
    await store.insertJobSource({ name: 'Feed' });
    const saved = await addJob(store, {
      externalId: 'saved',
      publishedAt: '2026-08-20T00:00:00.000Z',
    });
    const applied = await addJob(store, {
      externalId: 'applied',
      publishedAt: '2026-08-20T00:00:00.000Z',
    });
    await store.updateCanonicalJob(saved.jobId, {
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    await store.updateCanonicalJob(applied.jobId, {
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      discoveredAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const report = await cleanupStaleJobs(
      memoryCleanupCatalog(store, new Set([saved.jobId, applied.jobId])),
      { apply: true },
    );
    expect(report.referencedPreserved).toBe(2);
    expect(report.deleted).toBe(0);
    expect(store.listJobs()).toHaveLength(2);
  });

  it('preserves a stale canonical job that still has a fresh sibling posting', async () => {
    const store = new MemoryJobStore(() => NOW);
    const sourceA = await store.insertJobSource({ name: 'A' });
    const sourceB = await store.insertJobSource({ name: 'B' });
    const fromA = acmeFrontendJob({
      externalId: 'a',
      publishedAt: '2026-08-30T00:00:00.000Z',
    });
    fromA.source.sourceId = sourceA.id;
    const created = await persistNormalizedJob(store, fromA);
    const fromB = acmeFrontendJob({
      externalId: 'b',
      publishedAt: '2026-08-29T00:00:00.000Z',
      applyUrl: 'https://jobs.other-test.example/apply/fe',
      sourceUrl: 'https://jobs.other-test.example/jobs/fe',
    });
    fromB.source.sourceId = sourceB.id;
    await persistNormalizedJob(store, fromB);
    await store.updateCanonicalJob(created.jobId, {
      publishedAt: new Date('2023-01-01T00:00:00.000Z'),
      discoveredAt: new Date('2023-01-01T00:00:00.000Z'),
    });
    const sibling = store.listPostings().find((posting) => posting.externalId === 'a');
    expect(sibling).toBeDefined();
    await store.updateSourcePosting(sibling!.id, {
      publishedAt: new Date('2026-08-30T00:00:00.000Z'),
    });
    const report = await cleanupStaleJobs(memoryCleanupCatalog(store), { apply: true });
    expect(report.preservedBecauseFreshSibling).toBe(1);
    expect(report.deleted).toBe(0);
    expect(store.listJobs()).toHaveLength(1);
  });
});
