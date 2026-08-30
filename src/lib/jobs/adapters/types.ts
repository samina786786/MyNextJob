import type { JobSourceProvider, NormalizedJobInput } from '@/lib/jobs/types';

/**
 * Adapters own provider pagination. The engine receives one logical
 * snapshot per `fetchJobs` call and never understands Greenhouse pages,
 * Lever cursors, or RSS paging.
 *
 * `snapshotComplete: true` means this result is the full current listing
 * for the source (subject to configured adapter limits). Only then may
 * the engine count unseen postings as misses.
 *
 * `snapshotComplete: false` is a partial page/error/truncated fetch.
 * Partial snapshots must NEVER increment missing-job lifecycle counters.
 */
export type JobSourceContext = {
  sourceId: string;
  sourceName?: string;
  /** Provider-neutral board/token/slug from job_sources.external_identifier. */
  externalIdentifier?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  metadata?: Record<string, unknown>;
};

export type RawAdapterJob = NormalizedJobInput;

export type AdapterFetchMetadata = {
  pages?: number;
  requestCount?: number;
} & Record<string, unknown>;

export type AdapterFetchResult = {
  jobs: RawAdapterJob[];
  snapshotComplete: boolean;
  metadata?: AdapterFetchMetadata;
};

export interface JobSourceAdapter {
  readonly provider: JobSourceProvider;
  fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult>;
}
