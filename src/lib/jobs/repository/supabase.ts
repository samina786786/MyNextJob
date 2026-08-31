import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { PersistenceError } from '@/lib/jobs/errors';
import {
  companySlugWithCollisionSuffix,
  normalizeCompanyName,
} from '@/lib/jobs/normalization/normalize-company';
import { normalizeLocation } from '@/lib/jobs/normalization/normalize-location';
import { normalizeTitle } from '@/lib/jobs/normalization/normalize-title';
import {
  isPgUniqueViolation,
  PG_UNIQUE_VIOLATION,
  toDbEmploymentType,
  toDbRemoteType,
  toDbSalaryPeriod,
  toDbSourceType,
} from '@/lib/jobs/repository/db-values';
import type {
  CanonicalJobRecord,
  CompanyRecord,
  InsertCanonicalJobInput,
  InsertCompanyInput,
  InsertJobSourceInput,
  InsertSourcePostingInput,
  JobEngineStore,
  JobSourceRecord,
  SourcePostingRecord,
  SyncRunRecord,
} from '@/lib/jobs/repository/types';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_LIFECYCLE_POLICY,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  JOB_STORE_LIST_PAGE_SIZE,
} from '@/lib/jobs/types';
import type { JobSourceProvider, JobStatus, LifecyclePolicy, SourceStatus } from '@/lib/jobs/types';

type Row = Record<string, unknown>;

function throwIf(error: { message: string; code?: string } | null): void {
  if (!error) return;
  throw new PersistenceError(error.message, error.code);
}

/**
 * Complete list fetch. PostgREST silently caps a single SELECT at
 * ~1000 rows; range pages until a short page so ingestion never truncates.
 */
async function fetchAllEqPages(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<Row[]> {
  const all: Row[] = [];
  const seen = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, value)
      .order('id', { ascending: true })
      .range(from, from + JOB_STORE_LIST_PAGE_SIZE - 1);
    throwIf(error);
    const page = (data as Row[] | null) ?? [];
    for (const row of page) {
      const id = String(row.id);
      if (seen.has(id)) {
        throw new PersistenceError(`List fetch for ${table} returned duplicate pages`);
      }
      seen.add(id);
      all.push(row);
    }
    if (page.length < JOB_STORE_LIST_PAGE_SIZE) break;
    from += JOB_STORE_LIST_PAGE_SIZE;
  }
  return all;
}

function asIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asDateOrNull(value: unknown): Date | null {
  if (value == null || value === '') return null;
  return asDate(value);
}

function mapCompany(row: Row): CompanyRecord {
  const name = String(row.name ?? '');
  return {
    id: String(row.id),
    name,
    nameKey: String(row.name_key ?? normalizeCompanyName(name)),
    slug: String(row.slug ?? ''),
    domain: row.domain == null ? null : String(row.domain),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapSource(row: Row): JobSourceRecord {
  return {
    id: String(row.id),
    companyId: row.company_id == null ? null : String(row.company_id),
    name: String(row.name ?? ''),
    sourceType: String(row.source_type) as JobSourceProvider,
    externalIdentifier: row.external_identifier == null ? null : String(row.external_identifier),
    enabled: Boolean(row.enabled),
    syncFrequencyMinutes: Number(row.sync_frequency_minutes ?? DEFAULT_SYNC_INTERVAL_MINUTES),
    lastSyncedAt: asDateOrNull(row.last_synced_at),
    nextSyncAt: asDateOrNull(row.next_sync_at),
    status: String(row.status) as SourceStatus,
    errorCount: Number(row.error_count ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapPosting(row: Row): SourcePostingRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    sourceId: String(row.source_id),
    externalId: String(row.external_id),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    applyUrl: row.apply_url == null ? null : String(row.apply_url),
    rawPayload: row.raw_payload ?? null,
    publishedAt: asDateOrNull(row.published_at),
    firstSeenAt: asDate(row.first_seen_at),
    lastSeenAt: asDate(row.last_seen_at),
    active: Boolean(row.active),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    consecutiveMisses: Number(row.consecutive_misses ?? 0),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapJob(row: Row, company: CompanyRecord | null): CanonicalJobRecord {
  const title = String(row.title ?? '');
  const locationText = row.location_text == null ? null : String(row.location_text);
  const city = row.city == null ? null : String(row.city);
  const country = row.country == null ? null : String(row.country);
  const location = normalizeLocation({ text: locationText, city, country });
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    externalId: String(row.external_id),
    companyId: row.company_id == null ? null : String(row.company_id),
    companyNameKey: company?.nameKey ?? '',
    companyDomain: company?.domain ?? null,
    title,
    titleKey: normalizeTitle(title),
    slug: String(row.slug ?? ''),
    descriptionHtml: row.description_html == null ? null : String(row.description_html),
    descriptionText: row.description_text == null ? null : String(row.description_text),
    locationText,
    locationComparison: location.comparison,
    country,
    city,
    remoteType: toDbRemoteType(row.remote_type as never),
    employmentType: toDbEmploymentType(row.employment_type as never),
    experienceMin: row.experience_min == null ? null : Number(row.experience_min),
    experienceMax: row.experience_max == null ? null : Number(row.experience_max),
    salaryMin: row.salary_min == null ? null : Number(row.salary_min),
    salaryMax: row.salary_max == null ? null : Number(row.salary_max),
    salaryCurrency: row.salary_currency == null ? null : String(row.salary_currency),
    salaryPeriod: toDbSalaryPeriod(row.salary_period as never),
    publishedAt: asDateOrNull(row.published_at),
    discoveredAt: asDate(row.discovered_at),
    lastSeenAt: asDate(row.last_seen_at),
    status: String(row.status) as JobStatus,
    applyUrl: row.apply_url == null ? null : String(row.apply_url),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    fingerprint: String(row.fingerprint ?? ''),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    consecutiveMisses: Number(row.consecutive_misses ?? 0),
    closedAt: asDateOrNull(row.closed_at),
    statusChangedAt: asDateOrNull(row.status_changed_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function jobWriteRow(input: Partial<CanonicalJobRecord> & Partial<InsertCanonicalJobInput>): Row {
  const row: Row = {};
  if (input.sourceId !== undefined) row.source_id = input.sourceId;
  if (input.externalId !== undefined) row.external_id = input.externalId;
  if (input.companyId !== undefined) row.company_id = input.companyId;
  if (input.title !== undefined) row.title = input.title;
  if (input.slug !== undefined) row.slug = input.slug;
  if (input.descriptionHtml !== undefined) row.description_html = input.descriptionHtml;
  if (input.descriptionText !== undefined) row.description_text = input.descriptionText;
  if (input.locationText !== undefined) row.location_text = input.locationText;
  if (input.country !== undefined) row.country = input.country;
  if (input.city !== undefined) row.city = input.city;
  if (input.remoteType !== undefined) row.remote_type = toDbRemoteType(input.remoteType);
  if (input.employmentType !== undefined) row.employment_type = toDbEmploymentType(input.employmentType);
  if (input.experienceMin !== undefined) row.experience_min = input.experienceMin;
  if (input.experienceMax !== undefined) row.experience_max = input.experienceMax;
  if (input.salaryMin !== undefined) row.salary_min = input.salaryMin;
  if (input.salaryMax !== undefined) row.salary_max = input.salaryMax;
  if (input.salaryCurrency !== undefined) row.salary_currency = input.salaryCurrency;
  if (input.salaryPeriod !== undefined) row.salary_period = toDbSalaryPeriod(input.salaryPeriod);
  if (input.publishedAt !== undefined) row.published_at = asIso(input.publishedAt);
  if (input.discoveredAt !== undefined) row.discovered_at = asIso(input.discoveredAt);
  if (input.lastSeenAt !== undefined) row.last_seen_at = asIso(input.lastSeenAt);
  if (input.status !== undefined) row.status = input.status;
  if (input.applyUrl !== undefined) row.apply_url = input.applyUrl;
  if (input.sourceUrl !== undefined) row.source_url = input.sourceUrl;
  if (input.fingerprint !== undefined) row.fingerprint = input.fingerprint;
  if (input.contentHash !== undefined) row.content_hash = input.contentHash;
  if (input.consecutiveMisses !== undefined) row.consecutive_misses = input.consecutiveMisses;
  if (input.closedAt !== undefined) row.closed_at = asIso(input.closedAt);
  if (input.statusChangedAt !== undefined) row.status_changed_at = asIso(input.statusChangedAt);
  return row;
}

function postingWriteRow(input: Partial<SourcePostingRecord> & Partial<InsertSourcePostingInput>): Row {
  const row: Row = {};
  if (input.jobId !== undefined) row.job_id = input.jobId;
  if (input.sourceId !== undefined) row.source_id = input.sourceId;
  if (input.externalId !== undefined) row.external_id = input.externalId;
  if (input.sourceUrl !== undefined) row.source_url = input.sourceUrl;
  if (input.applyUrl !== undefined) row.apply_url = input.applyUrl;
  if (input.rawPayload !== undefined) row.raw_payload = input.rawPayload;
  if (input.publishedAt !== undefined) row.published_at = asIso(input.publishedAt);
  if (input.firstSeenAt !== undefined) row.first_seen_at = asIso(input.firstSeenAt);
  if (input.lastSeenAt !== undefined) row.last_seen_at = asIso(input.lastSeenAt);
  if (input.active !== undefined) row.active = input.active;
  if (input.contentHash !== undefined) row.content_hash = input.contentHash;
  if (input.consecutiveMisses !== undefined) row.consecutive_misses = input.consecutiveMisses;
  return row;
}

/**
 * Production Job Engine store. Same contract as MemoryJobStore.
 * Phase 4 adapters call persist/sync against this — they do not write SQL.
 */
export class SupabaseJobStore implements JobEngineStore {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  now(): Date {
    return this.clock();
  }

  async findCompanyById(id: string): Promise<CompanyRecord | null> {
    const { data, error } = await this.supabase.from('companies').select('*').eq('id', id).maybeSingle();
    throwIf(error);
    return data ? mapCompany(data as Row) : null;
  }

  async findCompanyByDomain(domain: string): Promise<CompanyRecord | null> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();
    throwIf(error);
    return data ? mapCompany(data as Row) : null;
  }

  async findCompanyByNameKey(nameKey: string): Promise<CompanyRecord | null> {
    const matches = await this.findCompaniesByNameKey(nameKey);
    return matches.length === 1 ? matches[0] ?? null : null;
  }

  async findCompaniesByNameKey(nameKey: string): Promise<CompanyRecord[]> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('name_key', nameKey);
    throwIf(error);
    return ((data as Row[] | null) ?? []).map((row) => mapCompany(row));
  }

  async insertCompany(input: InsertCompanyInput): Promise<CompanyRecord> {
    const payload = {
      name: input.name,
      name_key: input.nameKey,
      slug: input.slug,
      domain: input.domain ? input.domain.toLowerCase() : null,
    };
    const { data, error } = await this.supabase.from('companies').insert(payload).select('*').single();
    if (isPgUniqueViolation(error) && input.domain) {
      const existing = await this.findCompanyByDomain(input.domain);
      if (existing) {
        throw new PersistenceError('Duplicate company domain', PG_UNIQUE_VIOLATION);
      }
    }
    if (isPgUniqueViolation(error)) {
      const retrySlug = companySlugWithCollisionSuffix(input.name, input.nameKey);
      if (retrySlug !== input.slug) {
        const retry = await this.supabase
          .from('companies')
          .insert({ ...payload, slug: retrySlug })
          .select('*')
          .single();
        throwIf(retry.error);
        return mapCompany(retry.data as Row);
      }
    }
    throwIf(error);
    return mapCompany(data as Row);
  }

  async getJobSource(id: string): Promise<JobSourceRecord | null> {
    const { data, error } = await this.supabase.from('job_sources').select('*').eq('id', id).maybeSingle();
    throwIf(error);
    return data ? mapSource(data as Row) : null;
  }

  async listJobSources(filter?: {
    sourceType?: JobSourceProvider;
    enabled?: boolean;
  }): Promise<JobSourceRecord[]> {
    let query = this.supabase.from('job_sources').select('*');
    if (filter?.sourceType) {
      query = query.eq('source_type', toDbSourceType(filter.sourceType));
    }
    if (filter?.enabled !== undefined) {
      query = query.eq('enabled', filter.enabled);
    }
    const { data, error } = await query;
    throwIf(error);
    return ((data as Row[] | null) ?? []).map((row) => mapSource(row));
  }

  async findJobSourceByExternalIdentifier(
    sourceType: JobSourceProvider,
    externalIdentifier: string,
  ): Promise<JobSourceRecord | null> {
    const needle = externalIdentifier.trim().toLowerCase();
    const sources = await this.listJobSources({ sourceType });
    return sources.find((source) => (source.externalIdentifier ?? '').trim().toLowerCase() === needle) ?? null;
  }

  async insertJobSource(input: InsertJobSourceInput): Promise<JobSourceRecord> {
    const payload: Row = {
      company_id: input.companyId ?? null,
      name: input.name,
      source_type: toDbSourceType(input.sourceType ?? 'custom'),
      external_identifier: input.externalIdentifier ?? null,
      enabled: input.enabled ?? true,
      sync_frequency_minutes: input.syncFrequencyMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
      status: input.status ?? 'active',
      metadata: input.metadata ?? {},
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await this.supabase.from('job_sources').insert(payload).select('*').single();
    throwIf(error);
    return mapSource(data as Row);
  }

  async updateJobSource(id: string, patch: Partial<JobSourceRecord>): Promise<void> {
    const row: Row = {};
    if (patch.companyId !== undefined) row.company_id = patch.companyId;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.sourceType !== undefined) row.source_type = toDbSourceType(patch.sourceType);
    if (patch.externalIdentifier !== undefined) row.external_identifier = patch.externalIdentifier;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.syncFrequencyMinutes !== undefined) {
      row.sync_frequency_minutes = patch.syncFrequencyMinutes;
    }
    if (patch.lastSyncedAt !== undefined) row.last_synced_at = asIso(patch.lastSyncedAt);
    if (patch.nextSyncAt !== undefined) row.next_sync_at = asIso(patch.nextSyncAt);
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.errorCount !== undefined) row.error_count = patch.errorCount;
    if (patch.metadata !== undefined) row.metadata = patch.metadata;
    const { error } = await this.supabase.from('job_sources').update(row).eq('id', id);
    throwIf(error);
  }

  async findSourcePosting(
    sourceId: string,
    externalId: string,
  ): Promise<SourcePostingRecord | null> {
    const { data, error } = await this.supabase
      .from('job_source_postings')
      .select('*')
      .eq('source_id', sourceId)
      .eq('external_id', externalId)
      .maybeSingle();
    throwIf(error);
    return data ? mapPosting(data as Row) : null;
  }

  async findPostingsBySource(sourceId: string): Promise<SourcePostingRecord[]> {
    const rows = await fetchAllEqPages(this.supabase, 'job_source_postings', 'source_id', sourceId);
    return rows.map(mapPosting);
  }

  async findPostingsByJob(jobId: string): Promise<SourcePostingRecord[]> {
    const { data, error } = await this.supabase
      .from('job_source_postings')
      .select('*')
      .eq('job_id', jobId);
    throwIf(error);
    return ((data as Row[] | null) ?? []).map(mapPosting);
  }

  async insertSourcePosting(input: InsertSourcePostingInput): Promise<SourcePostingRecord> {
    const payload = postingWriteRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await this.supabase
      .from('job_source_postings')
      .insert(payload)
      .select('*')
      .single();
    if (isPgUniqueViolation(error)) {
      throw new PersistenceError('Duplicate source posting identity', PG_UNIQUE_VIOLATION);
    }
    throwIf(error);
    return mapPosting(data as Row);
  }

  async updateSourcePosting(
    id: string,
    patch: Partial<SourcePostingRecord>,
  ): Promise<SourcePostingRecord> {
    const { data, error } = await this.supabase
      .from('job_source_postings')
      .update(postingWriteRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwIf(error);
    if (!data) throw new PersistenceError(`Unknown source posting ${id}`);
    return mapPosting(data as Row);
  }

  async findCanonicalJob(id: string): Promise<CanonicalJobRecord | null> {
    const { data, error } = await this.supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    throwIf(error);
    if (!data) return null;
    const row = data as Row;
    const company =
      row.company_id == null ? null : await this.findCompanyById(String(row.company_id));
    return mapJob(row, company);
  }

  async findCanonicalCandidates(fingerprint: string): Promise<CanonicalJobRecord[]> {
    const { data, error } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('fingerprint', fingerprint);
    throwIf(error);
    const rows = (data as Row[] | null) ?? [];
    const result: CanonicalJobRecord[] = [];
    for (const row of rows) {
      const company =
        row.company_id == null ? null : await this.findCompanyById(String(row.company_id));
      result.push(mapJob(row, company));
    }
    return result;
  }

  async insertCanonicalJob(input: InsertCanonicalJobInput): Promise<CanonicalJobRecord> {
    const payload = jobWriteRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await this.supabase.from('jobs').insert(payload).select('*').single();
    if (isPgUniqueViolation(error)) {
      throw new PersistenceError('Duplicate jobs (source_id, external_id)', PG_UNIQUE_VIOLATION);
    }
    throwIf(error);
    const row = data as Row;
    const company =
      row.company_id == null ? null : await this.findCompanyById(String(row.company_id));
    return mapJob(row, company);
  }

  async updateCanonicalJob(
    id: string,
    patch: Partial<CanonicalJobRecord>,
  ): Promise<CanonicalJobRecord> {
    const { data, error } = await this.supabase
      .from('jobs')
      .update(jobWriteRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwIf(error);
    if (!data) throw new PersistenceError(`Unknown canonical job ${id}`);
    const row = data as Row;
    const company =
      row.company_id == null ? null : await this.findCompanyById(String(row.company_id));
    return mapJob(row, company);
  }

  async deleteCanonicalJob(id: string): Promise<void> {
    const { error } = await this.supabase.from('jobs').delete().eq('id', id);
    throwIf(error);
  }

  async touchUnchangedSightings(input: {
    postingIds: string[];
    jobIds: string[];
    now: Date;
  }): Promise<void> {
    const seen = asIso(input.now);
    if (input.postingIds.length > 0) {
      const { error } = await this.supabase
        .from('job_source_postings')
        .update({
          last_seen_at: seen,
          consecutive_misses: 0,
          active: true,
        })
        .in('id', input.postingIds);
      throwIf(error);
    }
    if (input.jobIds.length > 0) {
      const { error: openError } = await this.supabase
        .from('jobs')
        .update({
          last_seen_at: seen,
          consecutive_misses: 0,
          status: 'open',
          closed_at: null,
        })
        .in('id', input.jobIds)
        .eq('status', 'open');
      throwIf(openError);
      const { error: reopenError } = await this.supabase
        .from('jobs')
        .update({
          last_seen_at: seen,
          consecutive_misses: 0,
          status: 'open',
          closed_at: null,
          status_changed_at: seen,
        })
        .in('id', input.jobIds)
        .neq('status', 'open');
      throwIf(reopenError);
    }
  }

  async startSyncRun(sourceId: string): Promise<SyncRunRecord> {
    const { data, error } = await this.supabase
      .from('source_sync_runs')
      .insert({ source_id: sourceId, status: 'running' })
      .select('*')
      .single();
    throwIf(error);
    const row = data as Row;
    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      startedAt: asDate(row.started_at),
      completedAt: asDateOrNull(row.completed_at),
      status: 'running',
      jobsFetched: Number(row.jobs_fetched ?? 0),
      jobsCreated: Number(row.jobs_created ?? 0),
      jobsUpdated: Number(row.jobs_updated ?? 0),
      jobsRejected: Number(row.jobs_rejected ?? 0),
      errorMessage: row.error_message == null ? null : String(row.error_message),
      metrics: (row.metrics as Record<string, unknown>) ?? {},
    };
  }

  async finishSyncRun(
    id: string,
    patch: Partial<
      Pick<
        SyncRunRecord,
        | 'status'
        | 'jobsFetched'
        | 'jobsCreated'
        | 'jobsUpdated'
        | 'jobsRejected'
        | 'errorMessage'
        | 'metrics'
      >
    >,
  ): Promise<void> {
    const row: Row = { completed_at: this.now().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.jobsFetched !== undefined) row.jobs_fetched = patch.jobsFetched;
    if (patch.jobsCreated !== undefined) row.jobs_created = patch.jobsCreated;
    if (patch.jobsUpdated !== undefined) row.jobs_updated = patch.jobsUpdated;
    if (patch.jobsRejected !== undefined) row.jobs_rejected = patch.jobsRejected;
    if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
    if (patch.metrics !== undefined) row.metrics = patch.metrics;
    const { error } = await this.supabase.from('source_sync_runs').update(row).eq('id', id);
    throwIf(error);
  }

  lifecyclePolicyForSource(source: JobSourceRecord): LifecyclePolicy {
    const meta = source.metadata ?? {};
    return {
      missesBeforePossiblyClosed:
        typeof meta.missesBeforePossiblyClosed === 'number'
          ? meta.missesBeforePossiblyClosed
          : DEFAULT_LIFECYCLE_POLICY.missesBeforePossiblyClosed,
      missesBeforeClosed:
        typeof meta.missesBeforeClosed === 'number'
          ? meta.missesBeforeClosed
          : DEFAULT_LIFECYCLE_POLICY.missesBeforeClosed,
    };
  }
}

export function createSupabaseJobStore(clock?: () => Date): SupabaseJobStore {
  return new SupabaseJobStore(createAdminClient(), clock);
}
