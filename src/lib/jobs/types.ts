/**
 * Canonical job-engine types. Provider-specific ATS fields must never
 * appear here (no greenhouseDepartment, leverCategories, ashbyJobId).
 */

export type JobSourceProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'we_work_remotely'
  | 'rss'
  | 'custom'
  | 'synthetic';

export type RemoteType = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance'
  | 'internship'
  | 'temporary'
  | 'unknown';

export type SalaryPeriod = 'hour' | 'day' | 'month' | 'year' | 'unknown';

/** Database job_status. Engine "active" maps to `open`. */
export type JobStatus = 'open' | 'possibly_closed' | 'closed' | 'draft' | 'expired';

export type SourceStatus = 'active' | 'paused' | 'error' | 'disabled';

export type SyncRunStatus = 'running' | 'succeeded' | 'failed';

export type SalaryInput = {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: SalaryPeriod | null;
};

export type NormalizedJobLocation = {
  text?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
};

export type NormalizedJobCompany = {
  companyId?: string;
  name: string;
  domain?: string | null;
  /** Optional employer logo URL. Not persisted in Phase 4D. */
  logoUrl?: string | null;
};

export type NormalizedJobSourceRef = {
  sourceId: string;
  externalId: string;
};

/**
 * Adapter output after source-specific mapping. This is the only shape
 * the engine accepts from adapters.
 */
export type NormalizedJobInput = {
  source: NormalizedJobSourceRef;
  company: NormalizedJobCompany;
  title: string;
  location: NormalizedJobLocation;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  salary?: SalaryInput | null;
  department?: string | null;
  team?: string | null;
  publishedAt?: string | Date | null;
  applyUrl: string;
  sourceUrl: string;
  rawPayload?: unknown;
};

export type RejectionReason =
  | 'missing_title'
  | 'missing_external_id'
  | 'missing_source'
  | 'missing_company'
  | 'invalid_apply_url'
  | 'invalid_source_url'
  | 'missing_url'
  | 'invalid_salary'
  | 'invalid_experience'
  | 'invalid_payload'
  | 'payload_too_large';

export const JOB_ENGINE_BATCH_SIZE = 100;

/** PostgREST default max-rows. Ingestion list fetches must page at this size. */
export const JOB_STORE_LIST_PAGE_SIZE = 1000;

export const RAW_PAYLOAD_MAX_BYTES = 32 * 1024;

export const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

export const DEFAULT_LIFECYCLE_POLICY = {
  missesBeforePossiblyClosed: 2,
  missesBeforeClosed: 4,
} as const;

export type LifecyclePolicy = {
  missesBeforePossiblyClosed: number;
  missesBeforeClosed: number;
};
