import { describe, expect, it } from 'vitest';

import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { StaleAdmissionError } from '@/lib/jobs/errors';
import { admitIncomingJob, freshnessAt, peekIncomingPublishedAt } from '@/lib/jobs/freshness';
import { acmeFrontendJob, SyntheticAdapter } from '@/lib/jobs/adapters/synthetic';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('freshness admission', () => {
  it('admits 1, 14, and 29 day-old published jobs', () => {
    expect(admitIncomingJob(new Date('2026-08-30T12:00:00.000Z'), NOW).admit).toBe(true);
    expect(admitIncomingJob(new Date('2026-08-17T12:00:00.000Z'), NOW).admit).toBe(true);
    expect(admitIncomingJob(new Date('2026-08-02T12:00:00.000Z'), NOW).admit).toBe(true);
  });

  it('stale-skips published jobs older than 30 days', () => {
    const result = admitIncomingJob(new Date('2026-07-31T11:59:00.000Z'), NOW);
    expect(result.admit).toBe(false);
    if (result.admit) return;
    expect(result.reason).toBe('stale_published');
  });

  it('admits jobs with no publishedAt', () => {
    expect(admitIncomingJob(null, NOW).admit).toBe(true);
    expect(admitIncomingJob(undefined, NOW).admit).toBe(true);
  });

  it('treats far-future publishedAt as untrusted and admits', () => {
    const result = admitIncomingJob(new Date('2027-01-01T00:00:00.000Z'), NOW);
    expect(result.admit).toBe(true);
    if (!result.admit) return;
    expect(result.trustedPublishedAt).toBe(false);
  });

  it('peeks publishedAt without requiring a prepared job', () => {
    expect(peekIncomingPublishedAt({ publishedAt: '2023-01-01T00:00:00.000Z' })?.toISOString()).toBe(
      '2023-01-01T00:00:00.000Z',
    );
    expect(peekIncomingPublishedAt({ publishedAt: null })).toBeNull();
    expect(peekIncomingPublishedAt({ title: 'x' })).toBeUndefined();
  });
});

describe('staleSkipped persist gate', () => {
  it('does not create a company or job for a stale published item', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    const job = acmeFrontendJob({
      publishedAt: '2023-01-15T00:00:00.000Z',
      company: { name: 'Ancient Co' },
    });
    job.source.sourceId = source.id;
    job.company.name = 'Ancient Co';
    await expect(persistNormalizedJob(store, job)).rejects.toBeInstanceOf(StaleAdmissionError);
    expect(store.listCompanies()).toHaveLength(0);
    expect(store.listJobs()).toHaveLength(0);
    expect(store.listPostings()).toHaveLength(0);
  });

  it('counts staleSkipped on sync and does not reject', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    const adapter = new SyntheticAdapter([
        acmeFrontendJob({
          externalId: 'old',
          publishedAt: '2023-04-01T00:00:00.000Z',
          company: { name: 'Old Co' },
        }),
        acmeFrontendJob({
          externalId: 'new',
          publishedAt: '2026-08-30T00:00:00.000Z',
        }),
    ]);
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.metrics.staleSkipped).toBe(1);
    expect(result.metrics.rejected).toBe(0);
    expect(result.metrics.accepted).toBe(1);
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listCompanies().some((company) => company.name === 'Old Co')).toBe(false);
  });

  it('persists untrusted future publishedAt as null so freshness uses discovered_at', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    const job = acmeFrontendJob({
      publishedAt: '2027-01-01T00:00:00.000Z',
    });
    job.source.sourceId = source.id;
    await persistNormalizedJob(store, job);
    const stored = store.listJobs()[0];
    expect(stored?.publishedAt).toBeNull();
    expect(stored?.discoveredAt.toISOString()).toBe(NOW.toISOString());
    expect(freshnessAt(stored!.publishedAt, stored!.discoveredAt).toISOString()).toBe(
      NOW.toISOString(),
    );
    expect(store.listPostings()[0]?.publishedAt).toBeNull();
  });

  it('keeps a valid publishedAt inside the 24h clock-skew window', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Feed' });
    const publishedAt = '2026-08-31T18:00:00.000Z';
    const job = acmeFrontendJob({ publishedAt });
    job.source.sourceId = source.id;
    await persistNormalizedJob(store, job);
    expect(store.listJobs()[0]?.publishedAt?.toISOString()).toBe(publishedAt);
  });
});
