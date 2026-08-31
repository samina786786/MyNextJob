import type {
  JobSourceProvider,
  JobStatus,
  LifecyclePolicy,
  SourceStatus,
  SyncRunStatus,
} from '@/lib/jobs/types';

export type CompanyRecord = {
  id: string;
  name: string;
  nameKey: string;
  slug: string;
  domain: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobSourceRecord = {
  id: string;
  companyId: string | null;
  name: string;
  sourceType: JobSourceProvider;
  /** Board token / feed id. Greenhouse uses the public job-board token. */
  externalIdentifier: string | null;
  enabled: boolean;
  syncFrequencyMinutes: number;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  status: SourceStatus;
  errorCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CanonicalJobRecord = {
  id: string;
  /** Original/primary source — compatibility with jobs.source_id. */
  sourceId: string;
  /** Original/primary external id — compatibility with jobs.external_id. */
  externalId: string;
  companyId: string | null;
  companyNameKey: string;
  companyDomain: string | null;
  title: string;
  titleKey: string;
  slug: string;
  descriptionHtml: string | null;
  descriptionText: string | null;
  locationText: string | null;
  locationComparison: string;
  country: string | null;
  city: string | null;
  remoteType: 'remote' | 'hybrid' | 'onsite' | null;
  employmentType:
    | 'full_time'
    | 'part_time'
    | 'contract'
    | 'freelance'
    | 'internship'
    | 'temporary'
    | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: 'hour' | 'day' | 'month' | 'year' | null;
  publishedAt: Date | null;
  discoveredAt: Date;
  lastSeenAt: Date;
  status: JobStatus;
  applyUrl: string | null;
  sourceUrl: string | null;
  fingerprint: string;
  contentHash: string | null;
  consecutiveMisses: number;
  closedAt: Date | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourcePostingRecord = {
  id: string;
  jobId: string;
  sourceId: string;
  externalId: string;
  sourceUrl: string | null;
  applyUrl: string | null;
  rawPayload: unknown;
  publishedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  active: boolean;
  contentHash: string | null;
  consecutiveMisses: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SyncRunRecord = {
  id: string;
  sourceId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: SyncRunStatus;
  jobsFetched: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsRejected: number;
  errorMessage: string | null;
  metrics: Record<string, unknown>;
};

export type InsertCompanyInput = {
  name: string;
  nameKey: string;
  slug: string;
  domain: string | null;
};

export type InsertJobSourceInput = {
  id?: string;
  companyId?: string | null;
  name: string;
  sourceType?: JobSourceProvider;
  externalIdentifier?: string | null;
  enabled?: boolean;
  syncFrequencyMinutes?: number;
  status?: SourceStatus;
  metadata?: Record<string, unknown>;
};

export type InsertCanonicalJobInput = Omit<
  CanonicalJobRecord,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export type InsertSourcePostingInput = Omit<
  SourcePostingRecord,
  'id' | 'createdAt' | 'updatedAt' | 'firstSeenAt'
> & { id?: string; firstSeenAt?: Date };

/**
 * Focused job-engine store. Not a generic repository framework.
 * Unit tests use the in-memory implementation. Live writes use
 * `SupabaseJobStore` with `SUPABASE_SECRET_KEY` (server-only).
 */
export interface JobEngineStore {
  now(): Date;

  findCompanyById(id: string): Promise<CompanyRecord | null>;
  findCompanyByDomain(domain: string): Promise<CompanyRecord | null>;
  findCompanyByNameKey(nameKey: string): Promise<CompanyRecord | null>;
  findCompaniesByNameKey(nameKey: string): Promise<CompanyRecord[]>;
  insertCompany(input: InsertCompanyInput): Promise<CompanyRecord>;

  getJobSource(id: string): Promise<JobSourceRecord | null>;
  listJobSources(filter?: {
    sourceType?: JobSourceProvider;
    enabled?: boolean;
  }): Promise<JobSourceRecord[]>;
  findJobSourceByExternalIdentifier(
    sourceType: JobSourceProvider,
    externalIdentifier: string,
  ): Promise<JobSourceRecord | null>;
  insertJobSource(input: InsertJobSourceInput): Promise<JobSourceRecord>;
  updateJobSource(id: string, patch: Partial<JobSourceRecord>): Promise<void>;

  findSourcePosting(sourceId: string, externalId: string): Promise<SourcePostingRecord | null>;
  findPostingsBySource(sourceId: string): Promise<SourcePostingRecord[]>;
  findPostingsByJob(jobId: string): Promise<SourcePostingRecord[]>;
  insertSourcePosting(input: InsertSourcePostingInput): Promise<SourcePostingRecord>;
  updateSourcePosting(id: string, patch: Partial<SourcePostingRecord>): Promise<SourcePostingRecord>;

  findCanonicalJob(id: string): Promise<CanonicalJobRecord | null>;
  findCanonicalCandidates(fingerprint: string): Promise<CanonicalJobRecord[]>;
  insertCanonicalJob(input: InsertCanonicalJobInput): Promise<CanonicalJobRecord>;
  updateCanonicalJob(id: string, patch: Partial<CanonicalJobRecord>): Promise<CanonicalJobRecord>;
  deleteCanonicalJob(id: string): Promise<void>;
  touchUnchangedSightings(input: {
    postingIds: string[];
    jobIds: string[];
    now: Date;
  }): Promise<void>;

  startSyncRun(sourceId: string): Promise<SyncRunRecord>;
  finishSyncRun(
    id: string,
    patch: Partial<Pick<
      SyncRunRecord,
      'status' | 'jobsFetched' | 'jobsCreated' | 'jobsUpdated' | 'jobsRejected' | 'errorMessage' | 'metrics'
    >>,
  ): Promise<void>;

  lifecyclePolicyForSource(source: JobSourceRecord): LifecyclePolicy;
}
