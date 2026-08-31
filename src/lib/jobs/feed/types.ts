import type { CanonicalJobRecord, CompanyRecord } from '@/lib/jobs/repository/types';
import type { EmploymentType, RemoteType, SalaryPeriod } from '@/lib/jobs/types';

export type FeedJob = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  title: string;
  locationText: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remoteType: RemoteType | null;
  employmentType: EmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  publishedAt: Date | null;
  discoveredAt: Date;
  freshnessAt: Date;
  status: CanonicalJobRecord['status'];
  applyUrl: string | null;
  sourceUrl: string | null;
};

export type FreshJobsPage = {
  jobs: FeedJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  limit: number;
};

export type FeedFilters = {
  /** Reserved for Phase 5D. Ignored in 5A. */
  remoteType?: RemoteType;
};

export function toFeedJob(job: CanonicalJobRecord, company: CompanyRecord | null): FeedJob {
  return {
    id: job.id,
    companyId: job.companyId,
    companyName: company?.name ?? null,
    title: job.title,
    locationText: job.locationText,
    city: job.city,
    region: null,
    country: job.country,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    publishedAt: job.publishedAt,
    discoveredAt: job.discoveredAt,
    freshnessAt: job.publishedAt ?? job.discoveredAt,
    status: job.status,
    applyUrl: job.applyUrl,
    sourceUrl: job.sourceUrl,
  };
}
