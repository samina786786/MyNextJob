import { describe, expect, it } from 'vitest';

import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
import { acmeFrontendJob, SyntheticAdapter, syntheticJob } from '@/lib/jobs/adapters/synthetic';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';
import {
  greenhouseJobFixture,
  greenhouseListFixture,
  mockGreenhouseFetch,
} from './fixtures/greenhouse-jobs';

const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('unchanged persist fast path', () => {
  it('does not repeat company or canonical job fetches for 90 unchanged postings', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Aggregator' });
    const jobs = Array.from({ length: 90 }, (_, i) =>
      acmeFrontendJob({
        externalId: `job-${i}`,
        title: `Engineer ${i}`,
        publishedAt: '2026-08-28T00:00:00.000Z',
        company: { name: i % 2 === 0 ? 'Toptal' : 'Acme Technologies' },
      }),
    );
    const adapter = new SyntheticAdapter(jobs);
    const first = await syncJobSource(store, source.id, adapter);
    expect(first.metrics.canonicalJobsCreated).toBe(90);
    expect((first.metrics.timings?.companyLookups ?? 99) <= 4).toBe(true);

    const origCompanyById = store.findCompanyById.bind(store);
    const origCompanyByName = store.findCompaniesByNameKey.bind(store);
    const origFindJob = store.findCanonicalJob.bind(store);
    const origFindPosting = store.findSourcePosting.bind(store);
    let companyById = 0;
    let companyByName = 0;
    let jobFetches = 0;
    let postingFetches = 0;
    store.findCompanyById = async (id) => {
      companyById += 1;
      return origCompanyById(id);
    };
    store.findCompaniesByNameKey = async (key) => {
      companyByName += 1;
      return origCompanyByName(key);
    };
    store.findCanonicalJob = async (id) => {
      jobFetches += 1;
      return origFindJob(id);
    };
    store.findSourcePosting = async (sourceId, externalId) => {
      postingFetches += 1;
      return origFindPosting(sourceId, externalId);
    };

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.unchanged).toBe(90);
    expect(second.metrics.staleSkipped).toBe(0);
    expect(companyById).toBe(0);
    expect(companyByName).toBe(0);
    expect(jobFetches).toBe(0);
    expect(postingFetches).toBe(0);
    expect(second.metrics.timings?.postingPrefetch).toBe(90);
    expect((second.metrics.timings?.batchedTouches ?? 0) >= 1).toBe(true);
  });

  it('Greenhouse unchanged sync still keeps the configured company', async () => {
    const store = new MemoryJobStore(() => NOW);
    const company = await store.insertCompany({
      name: 'Dscout',
      nameKey: 'dscout',
      slug: 'dscout',
      domain: 'dscout.com',
    });
    const source = await store.insertJobSource({
      name: 'Dscout',
      sourceType: 'greenhouse',
      externalIdentifier: 'dscout',
      companyId: company.id,
    });
    const adapter = new GreenhouseAdapter({
      boardToken: 'dscout',
      fetchBoard: false,
      fetchImpl: mockGreenhouseFetch({
        jobsBody: greenhouseListFixture([greenhouseJobFixture()], 1),
      }),
    });
    const first = await syncJobSource(store, source.id, adapter);
    expect(first.status).toBe('succeeded');
    expect(first.metrics.timings?.companyLookups).toBe(0);
    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.unchanged).toBeGreaterThan(0);
    expect(store.listJobs()[0]?.companyId).toBe(company.id);
    expect(store.listCompanies()).toHaveLength(1);
  });

  it('prefetches more than 1000 postings without per-identity lookups', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'Aggregator' });
    const jobs = Array.from({ length: 1101 }, (_, i) =>
      syntheticJob({
        externalId: `job-${i}`,
        title: `Engineer ${i}`,
        companyName: 'Acme Technologies',
        descriptionHtml: '<p>UI</p>',
        publishedAt: '2026-08-28T00:00:00.000Z',
      }),
    );
    const adapter = new SyntheticAdapter(jobs);
    const first = await syncJobSource(store, source.id, adapter);
    expect(first.metrics.canonicalJobsCreated).toBe(1101);

    let postingFetches = 0;
    const origFindPosting = store.findSourcePosting.bind(store);
    store.findSourcePosting = async (sourceId, externalId) => {
      postingFetches += 1;
      return origFindPosting(sourceId, externalId);
    };

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.unchanged).toBe(1101);
    expect(second.metrics.timings?.postingPrefetch).toBe(1101);
    expect(postingFetches).toBe(0);
  });
});

describe('persistNormalizedJob still updates content without a session', () => {
  it('updates when the description changes', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'A' });
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    await persistNormalizedJob(store, job);
    const updated = acmeFrontendJob({
      descriptionText: 'Now owning design-system tokens.',
    });
    updated.source.sourceId = source.id;
    const second = await persistNormalizedJob(store, updated);
    expect(second.kind).toBe('updated');
  });

  it('updates when only applyUrl changes', async () => {
    const store = new MemoryJobStore(() => NOW);
    const source = await store.insertJobSource({ name: 'A' });
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    await persistNormalizedJob(store, job);
    const updated = acmeFrontendJob({
      applyUrl: 'https://jobs.acme-test.example/apply/fe-v2',
    });
    updated.source.sourceId = source.id;
    const second = await persistNormalizedJob(store, updated);
    expect(second.kind).toBe('updated');
    expect(store.listJobs()[0]?.applyUrl).toBe('https://jobs.acme-test.example/apply/fe-v2');
    expect(store.listPostings()[0]?.applyUrl).toBe('https://jobs.acme-test.example/apply/fe-v2');
  });
});
