import { clampFeedLimit, decodeFeedCursor, encodeFeedCursor } from '@/lib/jobs/feed/cursor';
import { toFeedJob, type FeedFilters, type FreshJobsPage } from '@/lib/jobs/feed/types';
import { catalogCutoff, freshnessAt, isFreshForCatalog } from '@/lib/jobs/freshness';
import type { CanonicalJobRecord, CompanyRecord } from '@/lib/jobs/repository/types';

export type FeedCatalog = {
  now(): Date;
  listJobs(): CanonicalJobRecord[];
  listCompanies(): CompanyRecord[];
};

function compareFeed(a: CanonicalJobRecord, b: CanonicalJobRecord): number {
  const aAt = freshnessAt(a.publishedAt, a.discoveredAt).getTime();
  const bAt = freshnessAt(b.publishedAt, b.discoveredAt).getTime();
  if (aAt !== bAt) return bAt - aAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function afterCursor(
  job: CanonicalJobRecord,
  cursor: { freshnessAt: Date; id: string },
): boolean {
  const at = freshnessAt(job.publishedAt, job.discoveredAt).getTime();
  const cursorAt = cursor.freshnessAt.getTime();
  if (at < cursorAt) return true;
  if (at > cursorAt) return false;
  return job.id < cursor.id;
}

/**
 * Provider-neutral fresh-feed page. One canonical job per row.
 * Keyset pagination; never OFFSET. Freshness always applied.
 */
export function getFreshJobsPage(
  catalog: FeedCatalog,
  input: {
    limit?: number;
    cursor?: string | null;
    filters?: FeedFilters;
  } = {},
): FreshJobsPage {
  const now = catalog.now();
  const cutoff = catalogCutoff(now);
  const limit = clampFeedLimit(input.limit);
  const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;
  const companies = new Map(catalog.listCompanies().map((company) => [company.id, company]));

  const eligible = catalog
    .listJobs()
    .filter((job) => job.status === 'open')
    .filter((job) => isFreshForCatalog(freshnessAt(job.publishedAt, job.discoveredAt), now))
    .filter((job) => freshnessAt(job.publishedAt, job.discoveredAt).getTime() >= cutoff.getTime())
    .filter((job) => (cursor ? afterCursor(job, cursor) : true))
    .sort(compareFeed);

  const page = eligible.slice(0, limit + 1);
  const hasNextPage = page.length > limit;
  const jobs = (hasNextPage ? page.slice(0, limit) : page).map((job) =>
    toFeedJob(job, job.companyId ? companies.get(job.companyId) ?? null : null),
  );
  const last = jobs[jobs.length - 1];
  return {
    jobs,
    hasNextPage,
    limit,
    nextCursor:
      hasNextPage && last
        ? encodeFeedCursor({ freshnessAt: last.freshnessAt, id: last.id })
        : null,
  };
}
