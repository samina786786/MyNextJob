import { JobsFeed } from '@/features/jobs/components/JobsFeed';
import { JobsFeedSectionError } from '@/features/jobs/components/JobsFeedSectionError';
import { loadSharedFeedPage } from '@/lib/jobs/feed/load';
import { DEFAULT_FEED_PAGE_SIZE } from '@/lib/jobs/freshness';
import type { FeedPageResponse } from '@/lib/jobs/feed/card';

export async function JobsFeedSection() {
  let page: FeedPageResponse | null = null;
  try {
    page = await loadSharedFeedPage({ cursor: null, limit: DEFAULT_FEED_PAGE_SIZE });
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
    />
  );
}
