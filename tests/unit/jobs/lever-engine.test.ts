import { describe, expect, it } from 'vitest';

import { LeverAdapter } from '@/lib/jobs/adapters/lever';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

import { leverJobFixture, mockLeverPages } from './fixtures/lever-jobs';

async function seededStore() {
  const store = new MemoryJobStore();
  const company = await store.insertCompany({
    name: 'Drivetrain',
    nameKey: normalizeCompanyName('Drivetrain'),
    slug: 'drivetrain',
    domain: 'drivetrain.ai',
  });
  const source = await store.insertJobSource({
    name: 'Drivetrain',
    sourceType: 'lever',
    externalIdentifier: 'drivetrain',
    companyId: company.id,
    metadata: { lever_instance: 'global' },
  });
  return { store, source };
}

describe('Lever adapter → Job Engine → MemoryJobStore', () => {
  it('creates jobs on first sync and stays idempotent on repeat', async () => {
    const { store, source } = await seededStore();
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      fetchImpl: mockLeverPages([
        [
          leverJobFixture({ id: 'one', text: 'Frontend Engineer — India' }),
          leverJobFixture({
            id: 'two',
            text: 'Backend Engineer — India',
            workplaceType: 'hybrid',
            categories: { location: 'India', commitment: 'Contract' },
          }),
        ],
      ]),
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
    expect(store.listJobs().every((job) => job.publishedAt === null)).toBe(true);
    expect(store.listJobs().find((job) => job.externalId === 'one')?.remoteType).toBe('remote');
    expect(store.listJobs().find((job) => job.externalId === 'two')?.employmentType).toBe('contract');
  });

  it('rejects one malformed job and still ingests the valid ones', async () => {
    const { store, source } = await seededStore();
    const adapter = new LeverAdapter({
      site: 'drivetrain',
      fetchImpl: mockLeverPages([
        [
          leverJobFixture({ id: 'ok-1', text: 'Valid Engineer' }),
          leverJobFixture({ id: 'bad', text: '' }),
          leverJobFixture({ id: 'ok-2', text: 'Another Valid Engineer' }),
        ],
      ]),
    });
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.metrics.fetched).toBe(3);
    expect(result.metrics.accepted).toBe(2);
    expect(result.metrics.rejected).toBe(1);
    expect(store.listJobs()).toHaveLength(2);
  });

  it('fails the run on a 404 site and does not close existing jobs', async () => {
    const { store, source } = await seededStore();
    const ok = new LeverAdapter({
      site: 'drivetrain',
      fetchImpl: mockLeverPages([[leverJobFixture()]]),
    });
    await syncJobSource(store, source.id, ok);

    const missing = new LeverAdapter({
      site: 'drivetrain',
      fetchImpl: async () =>
        new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }),
    });
    const failed = await syncJobSource(store, source.id, missing);
    expect(failed.status).toBe('failed');
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.listPostings()[0]?.consecutiveMisses).toBe(0);
  });
});
