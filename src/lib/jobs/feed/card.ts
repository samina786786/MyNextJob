import type { FeedJob } from '@/lib/jobs/feed/types';
import type { EmploymentType, RemoteType, SalaryPeriod } from '@/lib/jobs/types';

/**
 * Compact card DTO for the home feed and GET /api/jobs/feed.
 * No descriptions, apply URLs, or ingestion internals.
 */
export type FeedCardJob = {
  id: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  title: string;
  locationText: string | null;
  city: string | null;
  country: string | null;
  remoteType: RemoteType | null;
  employmentType: EmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  publishedAt: string | null;
  discoveredAt: string;
  freshnessAt: string;
  sourceLabel: string | null;
};

export type FeedPageResponse = {
  items: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  asOf: string;
};

export function toFeedCardJob(job: FeedJob, sourceLabel: string | null): FeedCardJob {
  return {
    id: job.id,
    companyName: job.companyName,
    companyLogoUrl: job.companyLogoUrl,
    title: job.title,
    locationText: job.locationText,
    city: job.city,
    country: job.country,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
    discoveredAt: job.discoveredAt.toISOString(),
    freshnessAt: job.freshnessAt.toISOString(),
    sourceLabel,
  };
}

export const FEED_INTERNAL_FIELDS = [
  'raw_payload',
  'rawPayload',
  'fingerprint',
  'content_hash',
  'contentHash',
  'external_id',
  'externalId',
  'source_id',
  'sourceId',
  'consecutive_misses',
  'consecutiveMisses',
  'closed_at',
  'closedAt',
  'status_changed_at',
  'statusChangedAt',
] as const;

export function collectForbiddenFeedFields(value: unknown, found = new Set<string>()): string[] {
  if (value == null || typeof value !== 'object') return [...found];
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenFeedFields(item, found);
    return [...found];
  }
  for (const [key, nested] of Object.entries(value)) {
    if ((FEED_INTERNAL_FIELDS as readonly string[]).includes(key)) found.add(key);
    collectForbiddenFeedFields(nested, found);
  }
  return [...found];
}
