import { describe, expect, it } from 'vitest';

import { nextSyncDelayMinutes, BACKOFF_MAX_MINUTES, BACKOFF_BASE_MINUTES } from '@/lib/jobs/engine/backoff';
import { applyMissingLifecycle } from '@/lib/jobs/engine/lifecycle';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';
import { acmeFrontendJob } from '@/lib/jobs/adapters/synthetic';

describe('backoff helper', () => {
  it('returns the source interval on success', () => {
    expect(nextSyncDelayMinutes({ succeeded: true, errorCount: 4, intervalMinutes: 60 })).toBe(60);
  });

  it('grows exponentially and caps', () => {
    expect(nextSyncDelayMinutes({ succeeded: false, errorCount: 1 })).toBe(BACKOFF_BASE_MINUTES);
    expect(nextSyncDelayMinutes({ succeeded: false, errorCount: 2 })).toBe(BACKOFF_BASE_MINUTES * 2);
    expect(nextSyncDelayMinutes({ succeeded: false, errorCount: 20 })).toBe(BACKOFF_MAX_MINUTES);
  });
});

describe('missing-job lifecycle', () => {
  it('does not close after a single complete-snapshot miss', async () => {
    const store = new MemoryJobStore();
    const source = await store.insertJobSource({ name: 'Synthetic ATS' });
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    const persisted = await persistNormalizedJob(store, job);

    await applyMissingLifecycle(store, {
      sourceId: source.id,
      seenExternalIds: new Set(),
      snapshotComplete: true,
      policy: { missesBeforePossiblyClosed: 2, missesBeforeClosed: 4 },
    });

    const afterOne = await store.findCanonicalJob(persisted.jobId);
    expect(afterOne?.status).toBe('open');
  });

  it('moves to possibly_closed then closed after repeated complete misses', async () => {
    const store = new MemoryJobStore();
    const source = await store.insertJobSource({ name: 'Synthetic ATS' });
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    const persisted = await persistNormalizedJob(store, job);
    const policy = { missesBeforePossiblyClosed: 2, missesBeforeClosed: 4 };

    for (let i = 0; i < 2; i += 1) {
      await applyMissingLifecycle(store, {
        sourceId: source.id,
        seenExternalIds: new Set(),
        snapshotComplete: true,
        policy,
      });
    }
    expect((await store.findCanonicalJob(persisted.jobId))?.status).toBe('possibly_closed');

    for (let i = 0; i < 2; i += 1) {
      await applyMissingLifecycle(store, {
        sourceId: source.id,
        seenExternalIds: new Set(),
        snapshotComplete: true,
        policy,
      });
    }
    expect((await store.findCanonicalJob(persisted.jobId))?.status).toBe('closed');
  });

  it('does not count misses on a partial snapshot', async () => {
    const store = new MemoryJobStore();
    const source = await store.insertJobSource({ name: 'Synthetic ATS' });
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    const persisted = await persistNormalizedJob(store, job);

    await applyMissingLifecycle(store, {
      sourceId: source.id,
      seenExternalIds: new Set(),
      snapshotComplete: false,
      policy: { missesBeforePossiblyClosed: 1, missesBeforeClosed: 1 },
    });

    const after = await store.findCanonicalJob(persisted.jobId);
    expect(after?.status).toBe('open');
    expect((await store.findPostingsByJob(persisted.jobId))[0]?.consecutiveMisses).toBe(0);
  });
});
