import 'server-only';

import { revalidateTag } from 'next/cache';

import { JOBS_FEED_CACHE_TAG, jobCacheTag } from '@/lib/jobs/feed/cache-tags';

/**
 * Next-owned invalidation for the shared catalog cache.
 *
 * Ingestion CLIs run in a separate Node process. Importing this from
 * `pnpm jobs:*` does **not** reach a running Next server. Phase 5B
 * correctness relies on `jobsFresh` cache life (expire 600s). Phase 10
 * may call these helpers from a protected server path after sync.
 */
export function invalidateJobsFeedCache(): void {
  revalidateTag(JOBS_FEED_CACHE_TAG, 'max');
}

export function invalidateJobCache(jobId: string): void {
  revalidateTag(jobCacheTag(jobId), 'max');
}
