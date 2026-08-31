import { describe, expect, it } from 'vitest';

import { FeedCursorError } from '@/lib/jobs/errors';
import { clampFeedLimit, decodeFeedCursor, encodeFeedCursor } from '@/lib/jobs/feed/cursor';
import { getFreshJobsPage } from '@/lib/jobs/feed/get-fresh-jobs-page';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { acmeFrontendJob } from '@/lib/jobs/adapters/synthetic';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';
import type { CanonicalJobRecord } from '@/lib/jobs/repository/types';

const NOW = new Date('2026-08-31T12:00:00.000Z');

async function seededJob(
  store: MemoryJobStore,
  args: {
    title: string;
    publishedAt?: string | null;
    discoveredAt?: Date;
    id?: string;
    status?: CanonicalJobRecord['status'];
  },
) {
  const source = await store.insertJobSource({ name: 'Feed' });
  const job = acmeFrontendJob({
    externalId: args.title,
    title: args.title,
    publishedAt: args.publishedAt === null ? null : args.publishedAt ?? '2026-08-30T00:00:00.000Z',
  });
  job.source.sourceId = source.id;
  job.source.externalId = args.title;
  const outcome = await persistNormalizedJob(store, job);
  if (args.discoveredAt || args.id || args.status) {
    await store.updateCanonicalJob(outcome.jobId, {
      ...(args.discoveredAt ? { discoveredAt: args.discoveredAt } : {}),
      ...(args.status ? { status: args.status } : {}),
    });
  }
  if (args.id && args.id !== outcome.jobId) {
    throw new Error('custom ids are assigned at insert');
  }
  return outcome.jobId;
}

describe('feed cursor pagination', () => {
  it('returns 15 items, a next cursor, and a second page with no overlap', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    for (let i = 0; i < 20; i += 1) {
      const job = acmeFrontendJob({
        externalId: `job-${i.toString().padStart(2, '0')}`,
        title: `Role ${i.toString().padStart(2, '0')}`,
        publishedAt: new Date(NOW.getTime() - i * 60 * 60 * 1000).toISOString(),
      });
      job.source.sourceId = source.id;
      await persistNormalizedJob(store, job);
    }
    const page1 = getFreshJobsPage(store, { limit: 15 });
    expect(page1.jobs).toHaveLength(15);
    expect(page1.hasNextPage).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = getFreshJobsPage(store, { cursor: page1.nextCursor, limit: 15 });
    const ids1 = page1.jobs.map((job) => job.id);
    const ids2 = page2.jobs.map((job) => job.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    expect(page1.jobs[0]?.title).toBe('Role 00');
    expect(page2.jobs).toHaveLength(5);
    expect(page2.hasNextPage).toBe(false);
    expect(page2.nextCursor).toBeNull();
  });

  it('breaks ties with id DESC when freshness timestamps match', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    const publishedAt = '2026-08-30T10:00:00.000Z';
    for (const externalId of ['aaa', 'bbb', 'ccc']) {
      const job = acmeFrontendJob({ externalId, title: externalId, publishedAt });
      job.source.sourceId = source.id;
      await persistNormalizedJob(store, job);
    }
    const page = getFreshJobsPage(store, { limit: 15 });
    const ids = page.jobs.map((job) => job.id);
    const sorted = [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(ids).toEqual(sorted);
  });

  it('does not duplicate when a newer job is inserted between pages', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    for (let i = 0; i < 16; i += 1) {
      const job = acmeFrontendJob({
        externalId: `old-${i}`,
        title: `Old ${i}`,
        publishedAt: new Date(NOW.getTime() - (i + 2) * 60 * 60 * 1000).toISOString(),
      });
      job.source.sourceId = source.id;
      await persistNormalizedJob(store, job);
    }
    const page1 = getFreshJobsPage(store, { limit: 15 });
    const newer = acmeFrontendJob({
      externalId: 'brand-new',
      title: 'Brand New',
      publishedAt: NOW.toISOString(),
    });
    newer.source.sourceId = source.id;
    await persistNormalizedJob(store, newer);
    const page2 = getFreshJobsPage(store, { cursor: page1.nextCursor, limit: 15 });
    expect(page2.jobs.some((job) => job.title === 'Brand New')).toBe(false);
    const seen = new Set(page1.jobs.map((job) => job.id));
    for (const job of page2.jobs) expect(seen.has(job.id)).toBe(false);
  });

  it('rejects a malformed cursor and clamps limit', () => {
    expect(() => decodeFeedCursor('%%%not-base64%%%')).toThrow(FeedCursorError);
    expect(() => decodeFeedCursor(encodeFeedCursor({ freshnessAt: NOW, id: 'not-a-uuid' }))).toThrow(
      FeedCursorError,
    );
    expect(clampFeedLimit(500)).toBe(30);
    expect(clampFeedLimit(0)).toBe(1);
  });

  it('hides stale and non-open jobs from the feed without cleanup', async () => {
    const store = new MemoryJobStore(() => NOW);
    await seededJob(store, { title: 'Fresh Open', publishedAt: '2026-08-30T00:00:00.000Z' });
    const staleId = await seededJob(store, {
      title: 'Old Open',
      publishedAt: '2026-08-20T00:00:00.000Z',
    });
    await store.updateCanonicalJob(staleId, {
      publishedAt: new Date('2023-01-01T00:00:00.000Z'),
      discoveredAt: new Date('2023-01-01T00:00:00.000Z'),
    });
    const closedId = await seededJob(store, { title: 'Closed Fresh', publishedAt: '2026-08-30T00:00:00.000Z' });
    await store.updateCanonicalJob(closedId, { status: 'closed' });
    const page = getFreshJobsPage(store, { limit: 15 });
    expect(page.jobs.map((job) => job.title)).toEqual(['Fresh Open']);
    expect(page.jobs[0]).not.toHaveProperty('rawPayload');
    expect(page.jobs[0]).not.toHaveProperty('fingerprint');
    expect(page.jobs[0]).not.toHaveProperty('contentHash');
  });

  it('returns an empty final page safely', () => {
    const store = new MemoryJobStore(() => NOW);
    const page = getFreshJobsPage(store, { limit: 15 });
    expect(page.jobs).toHaveLength(0);
    expect(page.hasNextPage).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
