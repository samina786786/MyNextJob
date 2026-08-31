import { PersistenceError } from '@/lib/jobs/errors';
import { companySlugWithCollisionSuffix } from '@/lib/jobs/normalization/normalize-company';
import { DEFAULT_LIFECYCLE_POLICY, DEFAULT_SYNC_INTERVAL_MINUTES } from '@/lib/jobs/types';
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
import type { LifecyclePolicy } from '@/lib/jobs/types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Deterministic in-memory store for Phase 3 tests. Does not need a
 * service-role key or network. Unique (source_id, external_id) is enforced.
 */
export class MemoryJobStore implements JobEngineStore {
  private companies = new Map<string, CompanyRecord>();
  private sources = new Map<string, JobSourceRecord>();
  private jobs = new Map<string, CanonicalJobRecord>();
  private postings = new Map<string, SourcePostingRecord>();
  private postingKey = new Map<string, string>();
  private syncRuns = new Map<string, SyncRunRecord>();
  private clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  now(): Date {
    return this.clock();
  }

  async findCompanyById(id: string): Promise<CompanyRecord | null> {
    return this.companies.get(id) ? clone(this.companies.get(id)!) : null;
  }

  async findCompanyByDomain(domain: string): Promise<CompanyRecord | null> {
    const key = domain.toLowerCase();
    for (const company of this.companies.values()) {
      if (company.domain?.toLowerCase() === key) return clone(company);
    }
    return null;
  }

  async findCompanyByNameKey(nameKey: string): Promise<CompanyRecord | null> {
    const matches = await this.findCompaniesByNameKey(nameKey);
    return matches.length === 1 ? matches[0] ?? null : null;
  }

  async findCompaniesByNameKey(nameKey: string): Promise<CompanyRecord[]> {
    return [...this.companies.values()]
      .filter((company) => company.nameKey === nameKey)
      .map(clone);
  }

  async insertCompany(input: InsertCompanyInput): Promise<CompanyRecord> {
    if (input.domain) {
      const existing = [...this.companies.values()].find(
        (c) => c.domain?.toLowerCase() === input.domain!.toLowerCase(),
      );
      if (existing) {
        throw new PersistenceError('Duplicate company domain', '23505');
      }
    }
    let slug = input.slug;
    const taken = new Set([...this.companies.values()].map((c) => c.slug.toLowerCase()));
    if (taken.has(slug.toLowerCase())) {
      slug = companySlugWithCollisionSuffix(input.name, input.nameKey);
      if (taken.has(slug.toLowerCase())) {
        throw new PersistenceError('Duplicate company slug', '23505');
      }
    }
    const now = this.now();
    const record: CompanyRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      nameKey: input.nameKey,
      slug,
      domain: input.domain,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(record.id, record);
    return clone(record);
  }

  async getJobSource(id: string): Promise<JobSourceRecord | null> {
    return this.sources.get(id) ? clone(this.sources.get(id)!) : null;
  }

  async listJobSources(filter?: {
    sourceType?: JobSourceRecord['sourceType'];
    enabled?: boolean;
  }): Promise<JobSourceRecord[]> {
    return [...this.sources.values()]
      .filter((source) => {
        if (filter?.sourceType && source.sourceType !== filter.sourceType) return false;
        if (filter?.enabled !== undefined && source.enabled !== filter.enabled) return false;
        return true;
      })
      .map(clone);
  }

  async findJobSourceByExternalIdentifier(
    sourceType: JobSourceRecord['sourceType'],
    externalIdentifier: string,
  ): Promise<JobSourceRecord | null> {
    const needle = externalIdentifier.trim().toLowerCase();
    for (const source of this.sources.values()) {
      if (source.sourceType !== sourceType) continue;
      if ((source.externalIdentifier ?? '').trim().toLowerCase() === needle) {
        return clone(source);
      }
    }
    return null;
  }

  async insertJobSource(input: InsertJobSourceInput): Promise<JobSourceRecord> {
    const now = this.now();
    const record: JobSourceRecord = {
      id: input.id ?? crypto.randomUUID(),
      companyId: input.companyId ?? null,
      name: input.name,
      sourceType: input.sourceType ?? 'synthetic',
      externalIdentifier: input.externalIdentifier ?? null,
      enabled: input.enabled ?? true,
      syncFrequencyMinutes: input.syncFrequencyMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
      lastSyncedAt: null,
      nextSyncAt: null,
      status: input.status ?? 'active',
      errorCount: 0,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.sources.set(record.id, record);
    return clone(record);
  }

  async updateJobSource(id: string, patch: Partial<JobSourceRecord>): Promise<void> {
    const current = this.sources.get(id);
    if (!current) throw new PersistenceError(`Unknown job source ${id}`);
    this.sources.set(id, { ...current, ...patch, id, updatedAt: this.now() });
  }

  async findSourcePosting(
    sourceId: string,
    externalId: string,
  ): Promise<SourcePostingRecord | null> {
    const id = this.postingKey.get(`${sourceId}::${externalId}`);
    if (!id) return null;
    const row = this.postings.get(id);
    return row ? clone(row) : null;
  }

  async findPostingsBySource(sourceId: string): Promise<SourcePostingRecord[]> {
    return [...this.postings.values()]
      .filter((p) => p.sourceId === sourceId)
      .map(clone);
  }

  async findPostingsByJob(jobId: string): Promise<SourcePostingRecord[]> {
    return [...this.postings.values()].filter((p) => p.jobId === jobId).map(clone);
  }

  async insertSourcePosting(input: InsertSourcePostingInput): Promise<SourcePostingRecord> {
    const key = `${input.sourceId}::${input.externalId}`;
    if (this.postingKey.has(key)) {
      throw new PersistenceError('Duplicate source posting identity');
    }
    const now = this.now();
    const record: SourcePostingRecord = {
      id: input.id ?? crypto.randomUUID(),
      jobId: input.jobId,
      sourceId: input.sourceId,
      externalId: input.externalId,
      sourceUrl: input.sourceUrl,
      applyUrl: input.applyUrl,
      rawPayload: input.rawPayload,
      publishedAt: input.publishedAt,
      firstSeenAt: input.firstSeenAt ?? now,
      lastSeenAt: input.lastSeenAt,
      active: input.active,
      contentHash: input.contentHash,
      consecutiveMisses: input.consecutiveMisses,
      createdAt: now,
      updatedAt: now,
    };
    this.postings.set(record.id, record);
    this.postingKey.set(key, record.id);
    return clone(record);
  }

  async updateSourcePosting(
    id: string,
    patch: Partial<SourcePostingRecord>,
  ): Promise<SourcePostingRecord> {
    const current = this.postings.get(id);
    if (!current) throw new PersistenceError(`Unknown source posting ${id}`);
    const next = { ...current, ...patch, id, updatedAt: this.now() };
    this.postings.set(id, next);
    return clone(next);
  }

  async findCanonicalJob(id: string): Promise<CanonicalJobRecord | null> {
    return this.jobs.get(id) ? clone(this.jobs.get(id)!) : null;
  }

  async findCanonicalCandidates(fingerprint: string): Promise<CanonicalJobRecord[]> {
    return [...this.jobs.values()].filter((j) => j.fingerprint === fingerprint).map(clone);
  }

  async insertCanonicalJob(input: InsertCanonicalJobInput): Promise<CanonicalJobRecord> {
    const duplicate = [...this.jobs.values()].find(
      (j) => j.sourceId === input.sourceId && j.externalId === input.externalId,
    );
    if (duplicate) {
      throw new PersistenceError('Duplicate jobs (source_id, external_id)');
    }
    const now = this.now();
    const record: CanonicalJobRecord = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(record.id, record);
    return clone(record);
  }

  async updateCanonicalJob(
    id: string,
    patch: Partial<CanonicalJobRecord>,
  ): Promise<CanonicalJobRecord> {
    const current = this.jobs.get(id);
    if (!current) throw new PersistenceError(`Unknown canonical job ${id}`);
    const next = { ...current, ...patch, id, updatedAt: this.now() };
    this.jobs.set(id, next);
    return clone(next);
  }

  async deleteCanonicalJob(id: string): Promise<void> {
    for (const posting of [...this.postings.values()]) {
      if (posting.jobId !== id) continue;
      this.postings.delete(posting.id);
      this.postingKey.delete(`${posting.sourceId}::${posting.externalId}`);
    }
    this.jobs.delete(id);
  }

  async touchUnchangedSightings(input: {
    postingIds: string[];
    jobIds: string[];
    now: Date;
  }): Promise<void> {
    for (const id of input.postingIds) {
      const current = this.postings.get(id);
      if (!current) continue;
      this.postings.set(id, {
        ...current,
        lastSeenAt: input.now,
        consecutiveMisses: 0,
        active: true,
        updatedAt: input.now,
      });
    }
    for (const id of input.jobIds) {
      const current = this.jobs.get(id);
      if (!current) continue;
      this.jobs.set(id, {
        ...current,
        lastSeenAt: input.now,
        consecutiveMisses: 0,
        status: 'open',
        closedAt: null,
        statusChangedAt: current.status === 'open' ? current.statusChangedAt : input.now,
        updatedAt: input.now,
      });
    }
  }

  async startSyncRun(sourceId: string): Promise<SyncRunRecord> {
    const now = this.now();
    const record: SyncRunRecord = {
      id: crypto.randomUUID(),
      sourceId,
      startedAt: now,
      completedAt: null,
      status: 'running',
      jobsFetched: 0,
      jobsCreated: 0,
      jobsUpdated: 0,
      jobsRejected: 0,
      errorMessage: null,
      metrics: {},
    };
    this.syncRuns.set(record.id, record);
    return clone(record);
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
    const current = this.syncRuns.get(id);
    if (!current) throw new PersistenceError(`Unknown sync run ${id}`);
    this.syncRuns.set(id, {
      ...current,
      ...patch,
      completedAt: this.now(),
    });
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

  getSyncRun(id: string): SyncRunRecord | null {
    return this.syncRuns.get(id) ? clone(this.syncRuns.get(id)!) : null;
  }

  listJobs(): CanonicalJobRecord[] {
    return [...this.jobs.values()].map(clone);
  }

  listPostings(): SourcePostingRecord[] {
    return [...this.postings.values()].map(clone);
  }

  listCompanies(): CompanyRecord[] {
    return [...this.companies.values()].map(clone);
  }
}
