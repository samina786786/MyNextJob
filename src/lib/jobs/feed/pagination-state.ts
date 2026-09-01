import { appendUniqueById } from '@/lib/jobs/feed/dedupe';
import type { FeedCardJob } from '@/lib/jobs/feed/card';

export type FeedPaginationState = {
  items: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  loadingNext: boolean;
  paginationError: boolean;
  /** True while a filter/search update is in flight (page-1 replace). */
  filterUpdating: boolean;
  /** True if the last filter update failed and we kept the previous items. */
  filterError: boolean;
  statusMessage: string;
};

export type FeedPaginationAction =
  | { type: 'load-start' }
  | {
      type: 'load-success';
      items: FeedCardJob[];
      nextCursor: string | null;
      hasNextPage: boolean;
    }
  | { type: 'load-failure' }
  | { type: 'filter-start' }
  | {
      type: 'filter-success';
      items: FeedCardJob[];
      nextCursor: string | null;
      hasNextPage: boolean;
    }
  | { type: 'filter-failure' };

export function createFeedPaginationState(input: {
  items: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
}): FeedPaginationState {
  return {
    items: input.items,
    nextCursor: input.nextCursor,
    hasNextPage: input.hasNextPage,
    loadingNext: false,
    paginationError: false,
    filterUpdating: false,
    filterError: false,
    statusMessage: '',
  };
}

export function feedPaginationReducer(
  state: FeedPaginationState,
  action: FeedPaginationAction,
): FeedPaginationState {
  switch (action.type) {
    case 'load-start':
      if (!state.hasNextPage || state.loadingNext || !state.nextCursor) return state;
      return { ...state, loadingNext: true, paginationError: false, statusMessage: '' };
    case 'load-failure':
      return { ...state, loadingNext: false, paginationError: true };
    case 'load-success': {
      const items = appendUniqueById(state.items, action.items);
      const added = items.length - state.items.length;
      return {
        ...state,
        items,
        nextCursor: action.nextCursor,
        hasNextPage: action.hasNextPage,
        loadingNext: false,
        paginationError: false,
        statusMessage: added > 0 ? `${added} more jobs loaded` : '',
      };
    }
    case 'filter-start':
      return {
        ...state,
        filterUpdating: true,
        filterError: false,
        statusMessage: 'Updating jobs',
      };
    case 'filter-failure':
      return {
        ...state,
        filterUpdating: false,
        filterError: true,
        statusMessage: '',
      };
    case 'filter-success': {
      // Full page-1 replacement — existing cards discarded because they
      // belonged to the previous filter state. Aborted in-flight
      // pagination is handled by the caller.
      const count = action.items.length;
      const message =
        count === 0 ? 'No fresh jobs match these filters' : `${count} jobs shown`;
      return {
        items: action.items,
        nextCursor: action.nextCursor,
        hasNextPage: action.hasNextPage,
        loadingNext: false,
        paginationError: false,
        filterUpdating: false,
        filterError: false,
        statusMessage: message,
      };
    }
    default:
      return state;
  }
}
