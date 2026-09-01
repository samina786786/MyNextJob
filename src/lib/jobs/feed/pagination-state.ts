import { appendUniqueById } from '@/lib/jobs/feed/dedupe';
import type { FeedCardJob } from '@/lib/jobs/feed/card';

export type FeedPaginationState = {
  items: FeedCardJob[];
  nextCursor: string | null;
  hasNextPage: boolean;
  loadingNext: boolean;
  paginationError: boolean;
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
  | { type: 'load-failure' };

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
        items,
        nextCursor: action.nextCursor,
        hasNextPage: action.hasNextPage,
        loadingNext: false,
        paginationError: false,
        statusMessage: added > 0 ? `${added} more jobs loaded` : '',
      };
    }
    default:
      return state;
  }
}
