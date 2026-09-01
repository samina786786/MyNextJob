import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { toFeedCardJob, type FeedPageResponse } from '@/lib/jobs/feed/card';
import {
  JOBS_FEED_CACHE_TAG,
  COMPANY_ASSETS_CACHE_TAG,
  JOBS_FRESH_CACHE_LIFE,
  jobCacheTag,
} from '@/lib/jobs/feed/cache-tags';
import {
  EMPTY_FEED_FILTERS,
  feedFiltersCacheKey,
  parseFeedFilters,
  type FeedFilters,
} from '@/lib/jobs/feed/filters';
import { getAttributionLabelsByJobIds } from '@/lib/jobs/feed/supabase-attribution';
import { getFreshJobDetailFromClient, type JobDetailDto } from '@/lib/jobs/feed/supabase-detail';
import { getFreshJobsPageFromClient } from '@/lib/jobs/feed/supabase-feed';
import { createAdminClient } from '@/lib/supabase/admin';

function logCacheMiss(label: string, extra: Record<string, string | number | null>): void {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.JOBS_FEED_CACHE_DEBUG !== '1') return;
  console.info(`[jobs-feed-cache] miss ${label}`, extra);
}

async function loadFilteredPage(
  cursor: string | null,
  limit: number,
  filters: FeedFilters,
): Promise<FeedPageResponse> {
  const client = createAdminClient();
  const page = await getFreshJobsPageFromClient(client, { cursor, limit, filters });
  const labels = await getAttributionLabelsByJobIds(
    client,
    page.jobs.map((job) => job.id),
  );

  for (const job of page.jobs) {
    cacheTag(jobCacheTag(job.id));
  }

  return {
    items: page.jobs.map((job) => toFeedCardJob(job, labels.get(job.id) ?? null)),
    nextCursor: page.nextCursor,
    hasNextPage: page.hasNextPage,
    asOf: new Date().toISOString(),
  };
}

/**
 * Shared catalog page. Arguments are only cursor + limit + parsed filter
 * arguments — never user identity, cookies, claims, or profile.
 *
 * The filter object is normalized before it reaches this function so cache
 * cardinality stays bounded. Different filter states → different cache
 * entries, but semantically-equivalent URLs (e.g. `work=hybrid,remote` vs
 * `work=remote,hybrid`) share one entry.
 */
export async function getCachedFreshJobsPage(
  cursor: string | null,
  limit: number,
  filterKey: string,
): Promise<FeedPageResponse> {
  'use cache';
  cacheLife(JOBS_FRESH_CACHE_LIFE);
  cacheTag(JOBS_FEED_CACHE_TAG);
  cacheTag(COMPANY_ASSETS_CACHE_TAG);

  logCacheMiss('feed', { cursor, limit, filterKey });

  // Decode the stable filter key back into the structured object. The key
  // is authoritative — we never keep a second copy of filters here.
  const filters = decodeFilterKey(filterKey);
  return loadFilteredPage(cursor, limit, filters);
}

/**
 * Encode a `FeedFilters` object as a stable, cache-safe key. Callers must
 * always pass this exact key to `getCachedFreshJobsPage` — that guarantees
 * only pre-normalized inputs enter the cache dictionary.
 */
export function toFilterCacheKey(filters: FeedFilters): string {
  return feedFiltersCacheKey(filters);
}

function decodeFilterKey(key: string): FeedFilters {
  if (!key) return EMPTY_FEED_FILTERS;
  const params = new URLSearchParams();
  for (const part of key.split('|')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (!name || !value) continue;
    params.set(name, value);
  }
  return parseFeedFilters(params);
}

export async function getCachedFreshJobDetail(jobId: string): Promise<JobDetailDto | null> {
  'use cache';
  cacheLife(JOBS_FRESH_CACHE_LIFE);
  cacheTag(JOBS_FEED_CACHE_TAG);
  cacheTag(COMPANY_ASSETS_CACHE_TAG);
  cacheTag(jobCacheTag(jobId));

  logCacheMiss('detail', { jobId, limit: 1 });

  return getFreshJobDetailFromClient(createAdminClient(), jobId);
}
