import { describe, expect, it } from 'vitest';

import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';
import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';

import {
  greenhouseJobFixture,
  greenhouseListFixture,
  mockGreenhouseFetch,
} from './fixtures/greenhouse-jobs';

async function seededStore() {
  const store = new MemoryJobStore();
  const company = await store.insertCompany({
    name: 'Dscout',
    nameKey: normalizeCompanyName('Dscout'),
    slug: 'dscout',
    domain: 'dscout.com',
  });
  const source = await store.insertJobSource({
    name: 'Dscout',
    sourceType: 'greenhouse',
    externalIdentifier: 'dscout',
    companyId: company.id,
  });
  return { store, source, company };
}

describe('Greenhouse adapter → Job Engine → MemoryJobStore', () => {
  it('creates jobs on first sync and stays idempotent on repeat', async () => {
    const { store, source } = await seededStore();
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture(
          [
            greenhouseJobFixture(),
            greenhouseJobFixture({
              id: 4370266010,
              title: 'Frontend Engineer',
              location: { name: 'Hybrid — Bengaluru' },
            }),
          ],
          2,
        ),
      }),
    });

    const first = await syncJobSource(store, source.id, adapter);
    expect(first.status).toBe('succeeded');
    expect(first.metrics.snapshotComplete).toBe(true);
    expect(first.metrics.canonicalJobsCreated).toBe(2);
    expect(first.metrics.sourcePostingsCreated).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);
    expect(store.listPostings().every((row) => row.active && row.consecutiveMisses === 0)).toBe(true);

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.status).toBe('succeeded');
    expect(second.metrics.canonicalJobsCreated).toBe(0);
    expect(second.metrics.unchanged).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);

    const persisted = store.listJobs();
    expect(persisted.every((job) => job.publishedAt === null)).toBe(true);
    expect(persisted.every((job) => job.companyId === source.companyId)).toBe(true);
  });

  it('rejects one malformed job and still ingests the valid ones', async () => {
    const { store, source } = await seededStore();
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture(
          [
            greenhouseJobFixture({ id: 1, title: 'Valid Engineer' }),
            greenhouseJobFixture({ id: 2, title: '' }),
            greenhouseJobFixture({ id: 3, title: 'Another Valid Engineer' }),
          ],
          3,
        ),
      }),
    });

    const result = await syncJobSource(store, source.id, adapter);
    expect(result.status).toBe('succeeded');
    expect(result.metrics.fetched).toBe(3);
    expect(result.metrics.accepted).toBe(2);
    expect(result.metrics.rejected).toBe(1);
    expect(store.listJobs()).toHaveLength(2);
    expect(result.rejections[0]?.reason).toMatch(/missing_title|invalid_payload/);
  });

  it('sanitizes unsafe HTML before persistence', async () => {
    const { store, source } = await seededStore();
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture(
          [
            greenhouseJobFixture({
              content: '<p>Safe</p><script>alert(1)</script>',
            }),
          ],
          1,
        ),
      }),
    });

    await syncJobSource(store, source.id, adapter);
    const job = store.listJobs()[0];
    expect(job?.descriptionHtml).toContain('<p>Safe</p>');
    expect(job?.descriptionHtml).not.toContain('script');
  });

  it('does not increment missing-job lifecycle when the snapshot is incomplete', async () => {
    const { store, source } = await seededStore();
    const complete = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture({ id: 10 }), greenhouseJobFixture({ id: 11 })], 2),
      }),
    });
    await syncJobSource(store, source.id, complete);

    const incomplete = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture({ id: 10 })], 50),
      }),
    });
    await syncJobSource(store, source.id, incomplete);

    const missed = store.listPostings().find((row) => row.externalId === '11');
    expect(missed?.consecutiveMisses).toBe(0);
    expect(missed?.active).toBe(true);
  });

  it('updates canonical content when the same Greenhouse id returns new copy', async () => {
    const { store, source } = await seededStore();
    const firstAdapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture({ content: '<p>Version one</p>' })], 1),
      }),
    });
    await syncJobSource(store, source.id, firstAdapter);

    const secondAdapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture({ content: '<p>Version two</p>' })], 1),
      }),
    });
    const second = await syncJobSource(store, source.id, secondAdapter);
    expect(second.metrics.canonicalJobsUpdated).toBe(1);
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listJobs()[0]?.descriptionText).toContain('Version two');
  });

  it('fails the run on a 404 board and does not close existing jobs', async () => {
    const { store, source } = await seededStore();
    const ok = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture()], 1),
      }),
    });
    await syncJobSource(store, source.id, ok);

    const missing = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({ jobsStatus: 404, jobsBody: {} }),
    });
    const failed = await syncJobSource(store, source.id, missing);
    expect(failed.status).toBe('failed');
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.listPostings()[0]?.active).toBe(true);
    expect(store.listPostings()[0]?.consecutiveMisses).toBe(0);
  });
});
