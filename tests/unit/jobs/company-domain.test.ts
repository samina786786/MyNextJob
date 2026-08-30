import { describe, expect, it } from 'vitest';

import { resolveCompany } from '@/lib/jobs/engine/resolve-company';
import type { PersistenceError } from '@/lib/jobs/errors';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

describe('company domain uniqueness', () => {
  it('rejects a second company with the same domain ignoring case', async () => {
    const store = new MemoryJobStore();
    await store.insertCompany({
      name: 'Acme Technologies',
      nameKey: 'acme technologies',
      slug: 'acme-technologies',
      domain: 'acme-test.example',
    });
    await expect(
      store.insertCompany({
        name: 'Acme Duplicate',
        nameKey: 'acme duplicate',
        slug: 'acme-duplicate',
        domain: 'ACME-TEST.example',
      }),
    ).rejects.toMatchObject({ pgCode: '23505' } satisfies Partial<PersistenceError>);
  });

  it('retries insert after a unique-domain race', async () => {
    const store = new MemoryJobStore();
    await store.insertCompany({
      name: 'Acme Technologies',
      nameKey: 'acme technologies',
      slug: 'acme-technologies',
      domain: 'acme-test.example',
    });
    let domainLookups = 0;
    const original = store.findCompanyByDomain.bind(store);
    store.findCompanyByDomain = async (domain: string) => {
      domainLookups += 1;
      if (domainLookups === 1) return null;
      return original(domain);
    };
    const source = await store.insertJobSource({ name: 'Synthetic ATS' });
    const prepared = prepareNormalizedJob({
      source: { sourceId: source.id, externalId: 'race-1' },
      company: { name: 'Acme Other', domain: 'acme-test.example' },
      title: 'Engineer',
      applyUrl: 'https://jobs.example.test/a',
      sourceUrl: 'https://jobs.example.test/s',
    });
    const company = await resolveCompany(store, prepared);
    expect(company.domain).toBe('acme-test.example');
    expect(store.listCompanies()).toHaveLength(1);
    expect(domainLookups).toBeGreaterThan(1);
  });
});
