import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PG_UNIQUE_VIOLATION } from '@/lib/jobs/repository/db-values';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

type Row = Record<string, unknown>;

function applyFilters(rows: Row[], filters: { col: string; val: unknown }[]): Row[] {
  return rows.filter((row) => filters.every((f) => String(row[f.col] ?? '') === String(f.val)));
}

function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    companies: [],
    job_sources: [],
    jobs: [],
    job_source_postings: [],
    source_sync_runs: [],
    ...seed,
  };

  const client = {
    from(table: string) {
      const filters: { col: string; val: unknown }[] = [];
      let pendingInsert: Row | null = null;
      let pendingUpdate: Row | null = null;

      const execute = async () => {
        const rows = tables[table] ?? [];
        if (pendingInsert) {
          if (table === 'companies' && pendingInsert.domain) {
            const dup = rows.find(
              (r) => String(r.domain).toLowerCase() === String(pendingInsert!.domain).toLowerCase(),
            );
            if (dup) {
              return { data: null, error: { message: 'duplicate key', code: PG_UNIQUE_VIOLATION } };
            }
          }
          if (table === 'job_source_postings') {
            const dup = rows.find(
              (r) =>
                r.source_id === pendingInsert!.source_id &&
                r.external_id === pendingInsert!.external_id,
            );
            if (dup) {
              return { data: null, error: { message: 'duplicate key', code: PG_UNIQUE_VIOLATION } };
            }
          }
          const now = new Date().toISOString();
          const row = {
            id: crypto.randomUUID(),
            created_at: now,
            updated_at: now,
            consecutive_misses: 0,
            active: true,
            error_count: 0,
            enabled: true,
            jobs_fetched: 0,
            jobs_created: 0,
            jobs_updated: 0,
            jobs_rejected: 0,
            started_at: now,
            status: table === 'source_sync_runs' ? 'running' : rowStatus(table),
            ...pendingInsert,
          };
          rows.push(row);
          tables[table] = rows;
          return { data: row, error: null };
        }
        if (pendingUpdate) {
          const matched = applyFilters(rows, filters);
          const first = matched[0];
          if (!first) return { data: null, error: null };
          Object.assign(first, pendingUpdate, { updated_at: new Date().toISOString() });
          return { data: first, error: null };
        }
        return { data: applyFilters(rows, filters), error: null };
      };

      const query: Record<string, unknown> = {
        select: () => query,
        insert: (row: Row) => {
          pendingInsert = row;
          return query;
        },
        update: (row: Row) => {
          pendingUpdate = row;
          return query;
        },
        eq: (col: string, val: unknown) => {
          filters.push({ col, val });
          return query;
        },
        maybeSingle: async () => {
          const result = await execute();
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return { data, error: result.error };
        },
        single: async () => {
          const result = await execute();
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return { data, error: result.error };
        },
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          execute().then(resolve, reject),
      };
      return query;
    },
  };

  return { client: client as unknown as SupabaseClient, tables };
}

function rowStatus(table: string): string {
  if (table === 'jobs') return 'open';
  if (table === 'job_sources') return 'active';
  return 'open';
}

describe('SupabaseJobStore', () => {
  it('writes unknown employment/remote/salary as NULL and synthetic source as custom', async () => {
    const { client, tables } = createFakeSupabase();
    const store = new SupabaseJobStore(client);
    const source = await store.insertJobSource({
      name: 'Synthetic ATS',
      sourceType: 'synthetic',
    });
    expect(tables.job_sources?.[0]?.source_type).toBe('custom');

    await store.insertCompany({
      name: 'Acme Technologies',
      nameKey: 'acme technologies',
      slug: 'acme-technologies',
      domain: 'acme-test.example',
    });
    const company = await store.findCompanyByDomain('acme-test.example');
    expect(company?.domain).toBe('acme-test.example');

    const job = await store.insertCanonicalJob({
      id: crypto.randomUUID(),
      sourceId: source.id,
      externalId: 'ext-1',
      companyId: company!.id,
      companyNameKey: 'acme technologies',
      companyDomain: 'acme-test.example',
      title: 'Engineer',
      titleKey: 'engineer',
      slug: 'engineer-aaaaaaaa',
      descriptionHtml: null,
      descriptionText: null,
      locationText: null,
      locationComparison: '',
      country: null,
      city: null,
      remoteType: null,
      employmentType: null,
      experienceMin: null,
      experienceMax: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      publishedAt: null,
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      status: 'open',
      applyUrl: 'https://jobs.example.test/a',
      sourceUrl: 'https://jobs.example.test/s',
      fingerprint: 'abc',
      contentHash: 'def',
      consecutiveMisses: 0,
      closedAt: null,
      statusChangedAt: null,
    });
    expect(tables.jobs?.[0]?.remote_type).toBeNull();
    expect(tables.jobs?.[0]?.employment_type).toBeNull();
    expect(tables.jobs?.[0]?.salary_period).toBeNull();
    expect(job.remoteType).toBeNull();

    await store.insertSourcePosting({
      jobId: job.id,
      sourceId: source.id,
      externalId: 'ext-1',
      sourceUrl: 'https://jobs.example.test/s',
      applyUrl: 'https://jobs.example.test/a',
      rawPayload: { title: 'Engineer' },
      publishedAt: null,
      lastSeenAt: new Date(),
      active: true,
      contentHash: 'def',
      consecutiveMisses: 0,
    });
    expect(tables.job_source_postings).toHaveLength(1);

    await expect(
      store.insertSourcePosting({
        jobId: job.id,
        sourceId: source.id,
        externalId: 'ext-1',
        sourceUrl: 'https://jobs.example.test/s',
        applyUrl: 'https://jobs.example.test/a',
        rawPayload: {},
        publishedAt: null,
        lastSeenAt: new Date(),
        active: true,
        contentHash: 'def',
        consecutiveMisses: 0,
      }),
    ).rejects.toMatchObject({ pgCode: PG_UNIQUE_VIOLATION });

    const sameFingerprint = await store.findCanonicalCandidates('abc');
    expect(sameFingerprint).toHaveLength(1);
  });

  it('surfaces duplicate domain as a unique violation for concurrent insert', async () => {
    const { client } = createFakeSupabase({
      companies: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Acme Technologies',
          name_key: 'acme technologies',
          slug: 'acme-technologies',
          domain: 'acme-test.example',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
    const store = new SupabaseJobStore(client);
    await expect(
      store.insertCompany({
        name: 'Acme Other',
        nameKey: 'acme other',
        slug: 'acme-other',
        domain: 'acme-test.example',
      }),
    ).rejects.toMatchObject({ pgCode: PG_UNIQUE_VIOLATION });
    const existing = await store.findCompanyByDomain('acme-test.example');
    expect(existing?.name).toBe('Acme Technologies');
  });

  it('does not require a secret key when the store is injected with a test client', async () => {
    expect(process.env.SUPABASE_SECRET_KEY).toBeFalsy();
    const { client } = createFakeSupabase();
    const store = new SupabaseJobStore(client);
    const run = await store.startSyncRun('22222222-2222-4222-8222-222222222222');
    expect(run.status).toBe('running');
  });
});

describe('persist maps unknown enums before store write', () => {
  it('stores null remote/employment when the adapter sends unknown', async () => {
    const store = new MemoryJobStore();
    const source = await store.insertJobSource({ name: 'Custom feed', sourceType: 'custom' });
    const outcome = await persistNormalizedJob(store, {
      source: { sourceId: source.id, externalId: 'u-1' },
      company: { name: 'Example Labs' },
      title: 'Engineer',
      remoteType: 'unknown',
      employmentType: 'unknown',
      applyUrl: 'https://jobs.example.test/a',
      sourceUrl: 'https://jobs.example.test/s',
      salary: { min: 10, max: 20, currency: 'USD', period: 'unknown' },
    });
    const job = await store.findCanonicalJob(outcome.jobId);
    expect(job?.remoteType).toBeNull();
    expect(job?.employmentType).toBeNull();
    expect(job?.salaryPeriod).toBeNull();
  });
});

describe('fingerprint remains non-unique at the store boundary', () => {
  it('returns multiple canonical candidates for one fingerprint', async () => {
    const store = new MemoryJobStore();
    const source = await store.insertJobSource({ name: 'A' });
    const company = await store.insertCompany({
      name: 'Acme Technologies',
      nameKey: 'acme technologies',
      slug: 'acme',
      domain: null,
    });
    const shared = {
      sourceId: source.id,
      companyId: company.id,
      companyNameKey: company.nameKey,
      companyDomain: null,
      title: 'Software Engineer',
      titleKey: 'software engineer',
      slug: 'se',
      descriptionHtml: null,
      descriptionText: 'Role A',
      locationText: 'Hyderabad',
      locationComparison: 'hyderabad',
      country: null,
      city: 'Hyderabad',
      remoteType: 'onsite' as const,
      employmentType: 'full_time' as const,
      experienceMin: null,
      experienceMax: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      publishedAt: null,
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      status: 'open' as const,
      applyUrl: 'https://jobs.example.test/a',
      sourceUrl: 'https://jobs.example.test/s',
      fingerprint: 'same-fingerprint',
      contentHash: 'h1',
      consecutiveMisses: 0,
      closedAt: null,
      statusChangedAt: null,
    };
    await store.insertCanonicalJob({ ...shared, externalId: 'a', descriptionText: 'Role A' });
    await store.insertCanonicalJob({
      ...shared,
      externalId: 'b',
      descriptionText: 'Role B — different requisition',
      contentHash: 'h2',
    });
    const found = await store.findCanonicalCandidates('same-fingerprint');
    expect(found).toHaveLength(2);
  });
});
