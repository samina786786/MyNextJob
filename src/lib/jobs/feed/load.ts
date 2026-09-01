import 'server-only';

import { decodeFeedCursor, isJobId } from '@/lib/jobs/feed/cursor';
import { getCachedFreshJobDetail, getCachedFreshJobsPage } from '@/lib/jobs/feed/cached';
import type { FeedPageResponse } from '@/lib/jobs/feed/card';
import type { JobDetailDto } from '@/lib/jobs/feed/supabase-detail';

/**
 * Validates the cursor *before* the shared cache so malformed keys are
 * never stored. Does not accept user identity.
 */
export async function loadSharedFeedPage(input: {
  cursor: string | null;
  limit: number;
}): Promise<FeedPageResponse> {
  if (input.cursor) decodeFeedCursor(input.cursor);
  return getCachedFreshJobsPage(input.cursor, input.limit);
}

export async function loadSharedJobDetail(jobId: string): Promise<JobDetailDto | null> {
  if (!isJobId(jobId)) return null;
  return getCachedFreshJobDetail(jobId);
}
