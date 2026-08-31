import { describe, expect, it } from 'vitest';

import { AshbyAdapter } from '@/lib/jobs/adapters/ashby';
import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
import { LeverAdapter } from '@/lib/jobs/adapters/lever';
import { WwrAdapter } from '@/lib/jobs/adapters/we-work-remotely';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { companySlugWithCollisionSuffix, normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

import { ashbyBoardFixture, ashbyJobFixture, mockAshbyFetch } from './fixtures/ashby-jobs';
import {
  greenhouseJobFixture,
  greenhouseListFixture,
  mockGreenhouseFetch,
} from './fixtures/greenhouse-jobs';
import { leverJobFixture, mockLeverPages } from './fixtures/lever-jobs';
import { mockWwrFetch, wwrItemXml, wwrRssXml } from './fixtures/wwr-jobs';

async function seededWwrStore() {
  const store = new MemoryJobStore();
  const source = await store.insertJobSource({
    name: 'We Work Remotely — All Jobs',
    sourceType: 'we_work_remotely',
    externalIdentifier: 'weworkremotely-all',
    companyId: null,
  });
  return { store, source };
}

describe('WWR adapter → Job Engine → MemoryJobStore', () => {
  it('creates per-job employers and stays idempotent', async () => {
    const { store, source } = await seededWwrStore();
    const xml = wwrRssXml([
      wwrItemXml({
        title: 'Alpha: Engineer',
        guid: 'https://weworkremotely.com/remote-jobs/alpha-engineer',
      }),
      wwrItemXml({
        title: 'Beta: Designer',
        guid: 'https://weworkremotely.com/remote-jobs/beta-designer',
      }),
      wwrItemXml({
        title: 'Alpha: Product Manager',
        guid: 'https://weworkremotely.com/remote-jobs/alpha-product-manager',
      }),
    ]);
    const adapter = new WwrAdapter({ fetchImpl: mockWwrFetch(xml) });

    const first = await syncJobSource(store, source.id, adapter);
    expect(first.status).toBe('succeeded');
    expect(first.metrics.snapshotComplete).toBe(false);
    expect(first.metrics.canonicalJobsCreated).toBe(3);
    expect(store.listJobs()).toHaveLength(3);
    expect(store.listPostings()).toHaveLength(3);
    expect(store.listCompanies()).toHaveLength(2);
    expect(source.companyId).toBeNull();
    expect(store.listCompanies().map((company) => company.name).sort()).toEqual(['Alpha', 'Beta']);
    expect(store.listJobs().every((job) => job.remoteType === 'remote')).toBe(true);
    expect(store.listJobs()[0]?.publishedAt).not.toBeNull();

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.canonicalJobsCreated).toBe(0);
    expect(second.metrics.unchanged).toBe(3);
    expect(store.listJobs()).toHaveLength(3);
    expect(store.listPostings()).toHaveLength(3);
    expect(store.listCompanies()).toHaveLength(2);
  });

  it('resolves Acme from a null company_id WWR source, never We Work Remotely', async () => {
    const { store, source } = await seededWwrStore();
    expect(source.companyId).toBeNull();
    const publisher = await store.insertCompany({
      name: 'We Work Remotely',
      nameKey: normalizeCompanyName('We Work Remotely'),
      slug: 'we-work-remotely',
      domain: 'weworkremotely.com',
    });
    const adapter = new WwrAdapter({
      fetchImpl: mockWwrFetch(
        wwrRssXml([
          wwrItemXml({
            title: 'Acme: Frontend Engineer',
            guid: 'https://weworkremotely.com/remote-jobs/acme-frontend-engineer',
          }),
        ]),
      ),
    });
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.status).toBe('succeeded');
    expect(result.metrics.accepted).toBe(1);
    const acme = store.listCompanies().find((company) => company.name === 'Acme');
    expect(acme).toBeDefined();
    expect(store.listJobs()[0]?.companyId).toBe(acme?.id);
    expect(store.listJobs()[0]?.companyId).not.toBe(publisher.id);
    expect(store.listJobs()[0]?.title).toBe('Frontend Engineer');
    expect(store.listCompanies().map((company) => company.name).sort()).toEqual([
      'Acme',
      'We Work Remotely',
    ]);
  });

  it('persists decoded RSS title entities rather than &amp;', async () => {
    const { store, source } = await seededWwrStore();
    const guid = 'https://weworkremotely.com/remote-jobs/mercury-counsel-product-regulatory';
    const adapter = new WwrAdapter({
      fetchImpl: mockWwrFetch(
        wwrRssXml([
          wwrItemXml({
            title: 'Mercury: Counsel, Product &amp; Regulatory - Payments &amp; AML',
            guid,
          }),
        ]),
      ),
    });
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.status).toBe('succeeded');
    expect(result.metrics.snapshotComplete).toBe(false);
    expect(store.listCompanies()[0]?.name).toBe('Mercury');
    expect(store.listJobs()[0]?.title).toBe('Counsel, Product & Regulatory - Payments & AML');
    expect(store.listJobs()[0]?.externalId).toBe(guid);
  });

  it('does not increment misses on the incomplete WWR snapshot', async () => {
    const { store, source } = await seededWwrStore();
    const firstXml = wwrRssXml([
      wwrItemXml({ title: 'Alpha: One', guid: 'https://weworkremotely.com/remote-jobs/alpha-one' }),
      wwrItemXml({ title: 'Beta: Two', guid: 'https://weworkremotely.com/remote-jobs/beta-two' }),
    ]);
    await syncJobSource(store, source.id, new WwrAdapter({ fetchImpl: mockWwrFetch(firstXml) }));
    const secondXml = wwrRssXml([
      wwrItemXml({ title: 'Alpha: One', guid: 'https://weworkremotely.com/remote-jobs/alpha-one' }),
    ]);
    await syncJobSource(store, source.id, new WwrAdapter({ fetchImpl: mockWwrFetch(secondXml) }));
    const missed = store.listPostings().find((row) => row.externalId.includes('beta-two'));
    expect(missed?.consecutiveMisses).toBe(0);
    expect(missed?.active).toBe(true);
  });

  it('uses a deterministic slug suffix on collision', async () => {
    const store = new MemoryJobStore();
    await store.insertCompany({
      name: 'Other Acme',
      nameKey: 'other acme',
      slug: 'acme',
      domain: null,
    });
    const created = await store.insertCompany({
      name: 'Acme',
      nameKey: 'acme',
      slug: 'acme',
      domain: null,
    });
    expect(created.slug).toBe(companySlugWithCollisionSuffix('Acme', 'acme'));
    expect(created.slug).not.toBe('acme');
  });
});

describe('fixed-company providers stay source-owned', () => {
  it('Greenhouse still uses the configured company', async () => {
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
    await syncJobSource(
      store,
      source.id,
      new GreenhouseAdapter({
        boardToken: 'dscout',
        fetchBoard: false,
        fetchImpl: mockGreenhouseFetch({
          jobsBody: greenhouseListFixture([greenhouseJobFixture()], 1),
        }),
      }),
    );
    expect(store.listJobs()[0]?.companyId).toBe(company.id);
    expect(store.listCompanies()).toHaveLength(1);
  });

  it('Lever still uses the configured company', async () => {
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
    await syncJobSource(
      store,
      source.id,
      new LeverAdapter({
        site: 'drivetrain',
        fetchImpl: mockLeverPages([[leverJobFixture()]]),
      }),
    );
    expect(store.listJobs()[0]?.companyId).toBe(company.id);
    expect(store.listCompanies()).toHaveLength(1);
  });

  it('Ashby still uses the configured company', async () => {
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
    await syncJobSource(
      store,
      source.id,
      new AshbyAdapter({
        fetchImpl: mockAshbyFetch(ashbyBoardFixture([ashbyJobFixture()])),
      }),
    );
    expect(store.listJobs()[0]?.companyId).toBe(company.id);
    expect(store.listCompanies()).toHaveLength(1);
  });
});
