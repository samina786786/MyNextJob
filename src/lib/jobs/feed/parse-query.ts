import { clampFeedLimit, decodeFeedCursor } from '@/lib/jobs/feed/cursor';
import { FeedCursorError } from '@/lib/jobs/errors';
import { parseFeedFilters, type FeedFilters } from '@/lib/jobs/feed/filters';
import { DEFAULT_FEED_PAGE_SIZE } from '@/lib/jobs/freshness';

export type ParsedFeedQuery = {
  cursor: string | null;
  limit: number;
  filters: FeedFilters;
};

/**
 * One canonical parser used by the API route, the server initial page,
 * and any place that must derive a cache key from URL input.
 */
export function parseFeedQuery(searchParams: URLSearchParams): ParsedFeedQuery {
  const rawCursor = searchParams.get('cursor');
  const cursor = rawCursor && rawCursor.trim().length > 0 ? rawCursor.trim() : null;
  if (cursor) decodeFeedCursor(cursor);

  const rawLimit = searchParams.get('limit');
  let limit = DEFAULT_FEED_PAGE_SIZE;
  if (rawLimit != null && rawLimit !== '') {
    const parsed = Number(rawLimit);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new FeedCursorError('Feed limit is invalid');
    }
    limit = clampFeedLimit(parsed);
  }

  return { cursor, limit, filters: parseFeedFilters(searchParams) };
}
