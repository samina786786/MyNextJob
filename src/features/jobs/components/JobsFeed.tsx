'use client';

import { usePathname, useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClayChip } from '@/components/clay/ClayChip';
import { ActiveFilterChips } from '@/features/jobs/components/ActiveFilterChips';
import { JobCard } from '@/features/jobs/components/JobCard';
import { JobCardSkeleton } from '@/features/jobs/components/JobCardSkeleton';
import { JobsFilterSheet } from '@/features/jobs/components/JobsFilterSheet';
import { JobsSearchBar } from '@/features/jobs/components/JobsSearchBar';
import type { FeedCardJob, FeedPageResponse } from '@/lib/jobs/feed/card';
import { FEED_LOGO_PRIORITY_COUNT } from '@/lib/jobs/feed/logo-priority';
import {
  DEFAULT_AGE_DAYS,
  EMPTY_FEED_FILTERS,
  feedFiltersEqual,
  feedFiltersToSearchParams,
  hasActiveFilters,
  hasNonQueryFilters,
  normalizeSearchQuery,
  type FeedFilters,
} from '@/lib/jobs/feed/filters';
import {
  createFeedPaginationState,
  feedPaginationReducer,
} from '@/lib/jobs/feed/pagination-state';

const PREFETCH_ROOT_MARGIN = '0px 0px 1000px 0px';
const SEARCH_DEBOUNCE_MS = 250;

function toApiUrl(cursor: string | null, filters: FeedFilters): string {
  const params = feedFiltersToSearchParams(filters);
  params.set('limit', '15');
  if (cursor) params.set('cursor', cursor);
  return `/api/jobs/feed?${params.toString()}`;
}

async function fetchFeedPage(
  url: string,
  signal: AbortSignal,
): Promise<FeedPageResponse> {
  const response = await fetch(url, {
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
  filters: initialFilters,
}: {
  initialItems: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  asOf: string;
  filters?: FeedFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<FeedFilters>(initialFilters ?? EMPTY_FEED_FILTERS);
  const [searchText, setSearchText] = useState<string>(filters.q ?? '');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [state, dispatch] = useReducer(
    feedPaginationReducer,
    { items: initialItems, nextCursor, hasNextPage },
    createFeedPaginationState,
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const paginationController = useRef<AbortController | null>(null);
  const filterController = useRef<AbortController | null>(null);
  const inFlightCursor = useRef<string | null>(null);
  const activeFiltersRef = useRef<FeedFilters>(filters);
  const [initialIds] = useState(() => new Set(initialItems.map((job) => job.id)));

  useEffect(() => {
    activeFiltersRef.current = filters;
  }, [filters]);

  const activeCount = useMemo(() => {
    let n = 0;
    n += filters.work.length;
    n += filters.employment.length;
    if (filters.location) n += 1;
    if (filters.age !== DEFAULT_AGE_DAYS) n += 1;
    return n;
  }, [filters]);

  const syncUrl = useCallback(
    (next: FeedFilters) => {
      const params = feedFiltersToSearchParams(next);
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  const applyFilters = useCallback(
    async (next: FeedFilters) => {
      if (feedFiltersEqual(next, activeFiltersRef.current)) return;
      setFilters(next);
      syncUrl(next);

      // Cancel any in-flight pagination — its results belong to the old filters.
      paginationController.current?.abort();
      paginationController.current = null;
      inFlightCursor.current = null;

      filterController.current?.abort();
      const controller = new AbortController();
      filterController.current = controller;
      dispatch({ type: 'filter-start' });
      try {
        const url = toApiUrl(null, next);
        const page = await fetchFeedPage(url, controller.signal);
        if (controller.signal.aborted) return;
        // Guard: filters may have changed again before this response arrived.
        if (!feedFiltersEqual(next, activeFiltersRef.current)) return;
        dispatch({
          type: 'filter-success',
          items: page.items,
          nextCursor: page.nextCursor,
          hasNextPage: page.hasNextPage,
        });
      } catch {
        if (controller.signal.aborted) return;
        dispatch({ type: 'filter-failure' });
      } finally {
        if (filterController.current === controller) filterController.current = null;
      }
    },
    [syncUrl],
  );

  // Debounce the search input separately from other filter changes so
  // rapid typing collapses into a single request. Other filter changes
  // apply immediately.
  useEffect(() => {
    const normalized = normalizeSearchQuery(searchText);
    if ((filters.q ?? null) === (normalized ?? null)) return;
    const handle = window.setTimeout(() => {
      void applyFilters({ ...activeFiltersRef.current, q: normalized });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchText, filters.q, applyFilters]);

  const loadNext = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!state.hasNextPage || !cursor || state.loadingNext || state.filterUpdating) return;
    if (inFlightCursor.current) return;

    inFlightCursor.current = cursor;
    dispatch({ type: 'load-start' });
    paginationController.current?.abort();
    const controller = new AbortController();
    paginationController.current = controller;

    const filtersAtStart = activeFiltersRef.current;
    try {
      const page = await fetchFeedPage(toApiUrl(cursor, filtersAtStart), controller.signal);
      if (controller.signal.aborted) return;
      // Filters changed while page-N was in flight — discard results.
      if (!feedFiltersEqual(filtersAtStart, activeFiltersRef.current)) return;
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
  }, [state.filterUpdating, state.hasNextPage, state.loadingNext, state.nextCursor]);

  useEffect(() => {
    return () => {
      paginationController.current?.abort();
      filterController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!state.hasNextPage || state.paginationError || state.filterUpdating) return;
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
  }, [
    loadNext,
    state.filterUpdating,
    state.hasNextPage,
    state.nextCursor,
    state.paginationError,
  ]);

  const handleSearchChange = useCallback((next: string) => setSearchText(next), []);
  const handleSearchClear = useCallback(() => setSearchText(''), []);

  const handleQuickToggle = useCallback(
    (patch: Partial<FeedFilters>) => {
      void applyFilters({ ...activeFiltersRef.current, ...patch });
    },
    [applyFilters],
  );

  const handleChipRemove = useCallback(
    (patch: Partial<FeedFilters>) => {
      void applyFilters({ ...activeFiltersRef.current, ...patch });
    },
    [applyFilters],
  );

  const handleClearFilters = useCallback(() => {
    // Clear all non-query filters; keep search query. Matches the "Clear
    // filters preserves search" contract documented in JOB_SEARCH_FILTERS.md.
    void applyFilters({
      ...activeFiltersRef.current,
      work: [],
      employment: [],
      location: null,
      age: DEFAULT_AGE_DAYS,
    });
  }, [applyFilters]);

  const handleSheetApply = useCallback(
    (next: {
      work: FeedFilters['work'];
      employment: FeedFilters['employment'];
      location: string | null;
      age: FeedFilters['age'];
    }) => {
      setSheetOpen(false);
      void applyFilters({ ...activeFiltersRef.current, ...next });
    },
    [applyFilters],
  );

  const handleSheetReset = useCallback(() => {
    setSheetOpen(false);
    handleClearFilters();
  }, [handleClearFilters]);

  const isRemoteQuick = filters.work.length === 1 && filters.work[0] === 'remote';
  const isSevenDayQuick = filters.age === 7;
  const empty = state.items.length === 0;
  const anyFilter = hasActiveFilters(filters);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <JobsSearchBar
          value={searchText}
          onChange={handleSearchChange}
          onClear={handleSearchClear}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ClayChip
            size="sm"
            active={isRemoteQuick}
            onClick={() =>
              handleQuickToggle({
                work: isRemoteQuick ? [] : ['remote'],
              })
            }
          >
            Remote
          </ClayChip>
          <ClayChip
            size="sm"
            active={isSevenDayQuick}
            onClick={() => handleQuickToggle({ age: isSevenDayQuick ? DEFAULT_AGE_DAYS : 7 })}
          >
            Last 7 days
          </ClayChip>
          <ClayButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
          >
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span>Filters{activeCount > 0 ? ` · ${activeCount}` : ''}</span>
            </span>
          </ClayButton>
        </div>
        <ActiveFilterChips
          filters={filters}
          onRemove={handleChipRemove}
          onClearAll={handleClearFilters}
        />
      </div>

      <div aria-live="polite" className="sr-only">
        {state.statusMessage}
      </div>

      {state.filterError ? (
        <ClayCard depth="raised" radius="xl" padding="md" className="space-y-3">
          <p className="text-[15px] font-medium text-foreground">Couldn&apos;t update jobs.</p>
          <ClayButton
            type="button"
            variant="secondary"
            size="md"
            onClick={() => void applyFilters(activeFiltersRef.current)}
          >
            Retry
          </ClayButton>
        </ClayCard>
      ) : null}

      {empty ? (
        <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
          <h3 className="text-[17px] font-semibold text-foreground">
            {filters.q
              ? `No fresh jobs found for “${filters.q}”.`
              : anyFilter
                ? 'No fresh jobs match these filters.'
                : 'No fresh jobs are available right now.'}
          </h3>
          <p className="text-[15px] text-secondary">
            {anyFilter
              ? 'Try widening your filters — the active catalog covers the last 30 days.'
              : 'New openings will show up here when they enter the active catalog.'}
          </p>
          {anyFilter ? (
            <ClayButton
              type="button"
              variant="secondary"
              size="md"
              onClick={handleClearFilters}
              disabled={!hasNonQueryFilters(filters) && filters.q === null}
            >
              Clear filters
            </ClayButton>
          ) : null}
        </ClayCard>
      ) : (
        <>
          <ul aria-label="Fresh jobs" className="space-y-4">
            {state.items.map((job, index) => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  asOf={asOf}
                  appear={!initialIds.has(job.id)}
                  priority={initialIds.has(job.id) && index < FEED_LOGO_PRIORITY_COUNT}
                />
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
              <ClayButton
                type="button"
                variant="secondary"
                size="md"
                onClick={() => void loadNext()}
              >
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
                className="scroll-mb-36"
                disabled={state.loadingNext || state.filterUpdating}
                onClick={() => void loadNext()}
              >
                Load more jobs
              </ClayButton>
            </>
          ) : (
            <p className="scroll-mb-36 px-1 pb-8 text-center text-sm text-secondary">
              You&apos;ve reached the end of the current fresh-job catalog.
            </p>
          )}
        </>
      )}

      <JobsFilterSheet
        open={sheetOpen}
        filters={filters}
        onClose={() => setSheetOpen(false)}
        onApply={handleSheetApply}
        onReset={handleSheetReset}
      />
    </div>
  );
}
