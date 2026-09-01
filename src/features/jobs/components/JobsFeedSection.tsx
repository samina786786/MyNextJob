import { JobsFeed } from '@/features/jobs/components/JobsFeed';
import { JobsFeedSectionError } from '@/features/jobs/components/JobsFeedSectionError';
import { EMPTY_FEED_FILTERS, type FeedFilters } from '@/lib/jobs/feed/filters';
import { loadSharedFeedPage } from '@/lib/jobs/feed/load';
import { DEFAULT_FEED_PAGE_SIZE } from '@/lib/jobs/freshness';
import type { FeedPageResponse } from '@/lib/jobs/feed/card';

/**
 * Server-renders the first filtered page. The URL is the source of truth
 * for filters; we never render an unfiltered page and swap it after hydration.
 */
export async function JobsFeedSection({
  filters = EMPTY_FEED_FILTERS,
}: { filters?: FeedFilters } = {}) {
  let page: FeedPageResponse | null = null;
  try {
    page = await loadSharedFeedPage({
      cursor: null,
      limit: DEFAULT_FEED_PAGE_SIZE,
      filters,
    });
  } catch {
    page = null;
  }

  if (!page) {
    return (
      <JobsFeedSectionError
        title="Couldn't load fresh jobs."
        message="Please try again in a moment."
      />
    );
  }

  return (
    <JobsFeed
      initialItems={page.items}
      nextCursor={page.nextCursor}
      hasNextPage={page.hasNextPage}
      asOf={page.asOf}
      filters={filters}
    />
  );
}
