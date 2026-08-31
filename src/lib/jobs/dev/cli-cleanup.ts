import 'server-only';

import { cleanupStaleJobs, formatCleanupReport, type CleanupCatalog } from '@/lib/jobs/cleanup/stale-jobs';
import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { PersistenceError } from '@/lib/jobs/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';
import type { CanonicalJobRecord, SourcePostingRecord } from '@/lib/jobs/repository/types';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import type { JobStatus } from '@/lib/jobs/types';

type CliOptions = {
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  pnpm jobs:cleanup --dry-run
  pnpm jobs:cleanup --apply

Default is dry-run. --apply permanently deletes unreferenced stale jobs.`);
      process.exit(0);
    }
  }
  return options;
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function asDateOrNull(value: unknown): Date | null {
  if (value == null || value === '') return null;
  return asDate(value);
}

async function liveCatalog(): Promise<CleanupCatalog> {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required for cleanup.');
  }
  const client = createAdminClient();
  const store = new SupabaseJobStore(client);

  const [{ data: jobRows, error: jobError }, { data: postingRows, error: postingError }] =
    await Promise.all([
      client.from('jobs').select(
        'id, published_at, discovered_at, status, source_id, external_id, company_id, title, slug, content_hash, consecutive_misses, last_seen_at, created_at, updated_at, location_text, city, country, closed_at, status_changed_at',
      ),
      client.from('job_source_postings').select('id, job_id, source_id, external_id, published_at, last_seen_at, first_seen_at, active, content_hash, consecutive_misses, created_at, updated_at, apply_url, source_url'),
    ]);
  if (jobError) throw new PersistenceError(jobError.message);
  if (postingError) throw new PersistenceError(postingError.message);

  const jobs: CanonicalJobRecord[] = ((jobRows as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id),
    externalId: String(row.external_id),
    companyId: row.company_id == null ? null : String(row.company_id),
    companyNameKey: '',
    companyDomain: null,
    title: String(row.title ?? ''),
    titleKey: '',
    slug: String(row.slug ?? ''),
    descriptionHtml: null,
    descriptionText: null,
    locationText: row.location_text == null ? null : String(row.location_text),
    locationComparison: '',
    country: row.country == null ? null : String(row.country),
    city: row.city == null ? null : String(row.city),
    remoteType: null,
    employmentType: null,
    experienceMin: null,
    experienceMax: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    publishedAt: asDateOrNull(row.published_at),
    discoveredAt: asDate(row.discovered_at),
    lastSeenAt: asDate(row.last_seen_at),
    status: String(row.status) as JobStatus,
    applyUrl: null,
    sourceUrl: null,
    fingerprint: '',
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    consecutiveMisses: Number(row.consecutive_misses ?? 0),
    closedAt: asDateOrNull(row.closed_at),
    statusChangedAt: asDateOrNull(row.status_changed_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  }));

  const postings: SourcePostingRecord[] = ((postingRows as Record<string, unknown>[] | null) ?? []).map(
    (row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      sourceId: String(row.source_id),
      externalId: String(row.external_id),
      sourceUrl: null,
      applyUrl: null,
      rawPayload: null,
      publishedAt: asDateOrNull(row.published_at),
      firstSeenAt: asDate(row.first_seen_at),
      lastSeenAt: asDate(row.last_seen_at),
      active: Boolean(row.active),
      contentHash: row.content_hash == null ? null : String(row.content_hash),
      consecutiveMisses: Number(row.consecutive_misses ?? 0),
      createdAt: asDate(row.created_at),
      updatedAt: asDate(row.updated_at),
    }),
  );

  const ids = jobs.map((job) => job.id);
  const referenced = new Set<string>();
  if (ids.length > 0) {
    const [{ data: saved }, { data: apps }, { data: matches }, { data: notes }] = await Promise.all([
      client.from('saved_jobs').select('job_id').in('job_id', ids),
      client.from('applications').select('job_id').in('job_id', ids),
      client.from('job_matches').select('job_id').in('job_id', ids),
      client.from('notifications').select('job_id').in('job_id', ids),
    ]);
    for (const row of saved ?? []) referenced.add(String((row as { job_id: string }).job_id));
    for (const row of apps ?? []) referenced.add(String((row as { job_id: string }).job_id));
    for (const row of matches ?? []) referenced.add(String((row as { job_id: string }).job_id));
    for (const row of notes ?? []) {
      const jobId = (row as { job_id: string | null }).job_id;
      if (jobId) referenced.add(String(jobId));
    }
  }

  return {
    now: () => store.now(),
    listJobs: () => jobs,
    listPostings: () => postings,
    referencedJobIds: () => referenced,
    deleteCanonicalJob: (id) => store.deleteCanonicalJob(id),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);
  const catalog = await liveCatalog();
  const report = await cleanupStaleJobs(catalog, { apply: options.apply });
  console.log(formatCleanupReport(report, options.apply));
}
