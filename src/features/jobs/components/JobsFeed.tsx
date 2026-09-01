'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';
import { JobCard } from '@/features/jobs/components/JobCard';
import { JobCardSkeleton } from '@/features/jobs/components/JobCardSkeleton';
import type { FeedCardJob, FeedPageResponse } from '@/lib/jobs/feed/card';
import {
  createFeedPaginationState,
  feedPaginationReducer,
} from '@/lib/jobs/feed/pagination-state';

const PREFETCH_ROOT_MARGIN = '0px 0px 1000px 0px';

async function fetchFeedPage(
  cursor: string,
  signal: AbortSignal,
): Promise<FeedPageResponse> {
  const params = new URLSearchParams({ cursor, limit: '15' });
  const response = await fetch(`/api/jobs/feed?${params.toString()}`, {
    method: 'GET',
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 401) {
    throw new Error('unauthorized');
  }
  if (!response.ok) {
    throw new Error('feed-failed');
  }
  return (await response.json()) as FeedPageResponse;
}

export function JobsFeed({
  initialItems,
  nextCursor,
  hasNextPage,
  asOf,
}: {
  initialItems: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  asOf: string;
}) {
  const [state, dispatch] = useReducer(
    feedPaginationReducer,
    { items: initialItems, nextCursor, hasNextPage },
    createFeedPaginationState,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightCursor = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [initialIds] = useState(() => new Set(initialItems.map((job) => job.id)));

  const loadNext = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!state.hasNextPage || !cursor || state.loadingNext) return;
    if (inFlightCursor.current) return;

    inFlightCursor.current = cursor;
    dispatch({ type: 'load-start' });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const page = await fetchFeedPage(cursor, controller.signal);
      dispatch({
        type: 'load-success',
        items: page.items,
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      });
    } catch {
      if (controller.signal.aborted) return;
      dispatch({ type: 'load-failure' });
    } finally {
      if (inFlightCursor.current === cursor) inFlightCursor.current = null;
    }
  }, [state.hasNextPage, state.loadingNext, state.nextCursor]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!state.hasNextPage || state.paginationError) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNext();
        }
      },
      { root: null, rootMargin: PREFETCH_ROOT_MARGIN, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNext, state.hasNextPage, state.paginationError, state.nextCursor]);

  if (state.items.length === 0) {
    return (
      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-2">
        <h3 className="text-[17px] font-semibold text-foreground">No fresh jobs are available right now.</h3>
        <p className="text-[15px] text-secondary">
          New openings will show up here when they enter the active catalog.
        </p>
      </ClayCard>
    );
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="sr-only">
        {state.statusMessage}
      </div>
      <ul aria-label="Fresh jobs" className="space-y-4">
        {state.items.map((job) => (
          <li key={job.id}>
            <JobCard job={job} asOf={asOf} appear={!initialIds.has(job.id)} />
          </li>
        ))}
      </ul>

      {state.loadingNext ? (
        <div className="space-y-4" aria-hidden="true">
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      ) : null}

      {state.paginationError ? (
        <ClayCard depth="raised" radius="xl" padding="md" className="space-y-3">
          <p className="text-[15px] font-medium text-foreground">Couldn&apos;t load more jobs.</p>
          <ClayButton type="button" variant="secondary" size="md" onClick={() => void loadNext()}>
            Retry
          </ClayButton>
        </ClayCard>
      ) : null}

      {state.hasNextPage ? (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
          <ClayButton
            type="button"
            variant="secondary"
            size="lg"
            block
            disabled={state.loadingNext}
            onClick={() => void loadNext()}
          >
            Load more jobs
          </ClayButton>
        </>
      ) : (
        <p className="px-1 pb-4 text-center text-sm text-secondary">
          You&apos;ve reached the end of the current fresh-job catalog.
        </p>
      )}
    </div>
  );
}
