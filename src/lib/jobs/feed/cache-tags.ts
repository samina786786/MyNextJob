/**
 * Central cache-tag helpers. Do not scatter raw tag strings in UI.
 * CLI ingestion cannot call these — see invalidate.ts.
 */
export const JOBS_FEED_CACHE_TAG = 'jobs-feed';

/** Matches `cacheLife.jobsFresh` in next.config.mjs. */
export const JOBS_FRESH_CACHE_LIFE = {
  stale: 60,
  revalidate: 60,
  expire: 600,
} as const;

export function jobCacheTag(jobId: string): string {
  return `job:${jobId}`;
}
