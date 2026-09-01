import 'server-only';

import { decodeFeedCursor, isJobId } from '@/lib/jobs/feed/cursor';
import {
  getCachedFreshJobDetail,
  getCachedFreshJobsPage,
  toFilterCacheKey,
} from '@/lib/jobs/feed/cached';
import type { FeedPageResponse } from '@/lib/jobs/feed/card';
import { EMPTY_FEED_FILTERS, type FeedFilters } from '@/lib/jobs/feed/filters';
import type { JobDetailDto } from '@/lib/jobs/feed/supabase-detail';

/**
 * Validates the cursor *before* the shared cache so malformed keys are
 * never stored. Does not accept user identity.
 *
 * Filters flow through a stable string key so the shared cache only ever
 * sees a small, deterministic set of keys per active-filter combination.
 */
export async function loadSharedFeedPage(input: {
  cursor: string | null;
  limit: number;
  filters?: FeedFilters;
}): Promise<FeedPageResponse> {
  if (input.cursor) decodeFeedCursor(input.cursor);
  const filters = input.filters ?? EMPTY_FEED_FILTERS;
  return getCachedFreshJobsPage(input.cursor, input.limit, toFilterCacheKey(filters));
}

export async function loadSharedJobDetail(jobId: string): Promise<JobDetailDto | null> {
  if (!isJobId(jobId)) return null;
  return getCachedFreshJobDetail(jobId);
}
