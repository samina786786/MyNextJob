import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { toFeedCardJob, type FeedPageResponse } from '@/lib/jobs/feed/card';
import { JOBS_FEED_CACHE_TAG, COMPANY_ASSETS_CACHE_TAG, JOBS_FRESH_CACHE_LIFE, jobCacheTag } from '@/lib/jobs/feed/cache-tags';
import { getAttributionLabelsByJobIds } from '@/lib/jobs/feed/supabase-attribution';
import { getFreshJobDetailFromClient, type JobDetailDto } from '@/lib/jobs/feed/supabase-detail';
import { getFreshJobsPageFromClient } from '@/lib/jobs/feed/supabase-feed';
import { createAdminClient } from '@/lib/supabase/admin';

function logCacheMiss(label: string, extra: Record<string, string | number | null>): void {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.JOBS_FEED_CACHE_DEBUG !== '1') return;
  console.info(`[jobs-feed-cache] miss ${label}`, extra);
}

/**
 * Shared catalog page. Arguments are only cursor + limit — never user
 * identity, cookies, claims, or profile.
 */
export async function getCachedFreshJobsPage(
  cursor: string | null,
  limit: number,
): Promise<FeedPageResponse> {
  'use cache';
  cacheLife(JOBS_FRESH_CACHE_LIFE);
  cacheTag(JOBS_FEED_CACHE_TAG);
  cacheTag(COMPANY_ASSETS_CACHE_TAG);

  logCacheMiss('feed', { cursor, limit });

  const client = createAdminClient();
  const page = await getFreshJobsPageFromClient(client, { cursor, limit });
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

export async function getCachedFreshJobDetail(jobId: string): Promise<JobDetailDto | null> {
  'use cache';
  cacheLife(JOBS_FRESH_CACHE_LIFE);
  cacheTag(JOBS_FEED_CACHE_TAG);
  cacheTag(COMPANY_ASSETS_CACHE_TAG);
  cacheTag(jobCacheTag(jobId));

  logCacheMiss('detail', { jobId, limit: 1 });

  return getFreshJobDetailFromClient(createAdminClient(), jobId);
}
