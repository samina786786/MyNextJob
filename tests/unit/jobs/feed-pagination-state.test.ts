import { describe, expect, it } from 'vitest';

import type { FeedCardJob } from '@/lib/jobs/feed/card';
import {
  createFeedPaginationState,
  feedPaginationReducer,
} from '@/lib/jobs/feed/pagination-state';

function job(id: string): FeedCardJob {
  return {
    id,
    companyName: 'Acme',
    companyLogoUrl: null,
    title: `Role ${id}`,
    locationText: null,
    city: null,
    country: null,
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    publishedAt: '2026-08-31T00:00:00.000Z',
    discoveredAt: '2026-08-31T00:00:00.000Z',
    freshnessAt: '2026-08-31T00:00:00.000Z',
    sourceLabel: 'Greenhouse',
  };
}

const PAGE1 = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'].map(job);
const PAGE2 = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'].map(job);

describe('feed pagination state', () => {
  it('keeps the same cursor until a successful response', () => {
    let state = createFeedPaginationState({
      items: PAGE1,
      nextCursor: 'cursor-page-2',
      hasNextPage: true,
    });
    state = feedPaginationReducer(state, { type: 'load-start' });
    expect(state.loadingNext).toBe(true);
    expect(state.nextCursor).toBe('cursor-page-2');

    state = feedPaginationReducer(state, { type: 'load-failure' });
    expect(state.paginationError).toBe(true);
    expect(state.items).toEqual(PAGE1);
    expect(state.nextCursor).toBe('cursor-page-2');

    state = feedPaginationReducer(state, { type: 'load-start' });
    expect(state.nextCursor).toBe('cursor-page-2');
    expect(state.paginationError).toBe(false);

    state = feedPaginationReducer(state, {
      type: 'load-success',
      items: PAGE2,
      nextCursor: null,
      hasNextPage: false,
    });
    expect(state.items.map((item) => item.id)).toEqual([...PAGE1, ...PAGE2].map((item) => item.id));
    expect(state.hasNextPage).toBe(false);
    expect(state.nextCursor).toBeNull();
  });

  it('does not render a duplicate id from a repeated page', () => {
    let state = createFeedPaginationState({
      items: PAGE1,
      nextCursor: 'cursor-page-2',
      hasNextPage: true,
    });
    state = feedPaginationReducer(state, { type: 'load-start' });
    state = feedPaginationReducer(state, {
      type: 'load-success',
      items: [PAGE1[0]!, ...PAGE2],
      nextCursor: null,
      hasNextPage: false,
    });
    expect(state.items.map((item) => item.id)).toEqual([
      PAGE1[0]?.id,
      PAGE1[1]?.id,
      PAGE2[0]?.id,
    ]);
  });

  it('stops requesting once the catalog page is exhausted', () => {
    const ended = createFeedPaginationState({
      items: PAGE1,
      nextCursor: null,
      hasNextPage: false,
    });
    const next = feedPaginationReducer(ended, { type: 'load-start' });
    expect(next).toBe(ended);
    expect(next.loadingNext).toBe(false);
  });

  it('filter-success replaces items and resets cursor without appending previous filter data', () => {
    let state = createFeedPaginationState({
      items: PAGE1,
      nextCursor: 'cursor-page-2',
      hasNextPage: true,
    });
    state = feedPaginationReducer(state, { type: 'filter-start' });
    expect(state.filterUpdating).toBe(true);
    expect(state.statusMessage).toBe('Updating jobs');

    state = feedPaginationReducer(state, {
      type: 'filter-success',
      items: PAGE2,
      nextCursor: 'cursor-page-2b',
      hasNextPage: true,
    });
    expect(state.items).toEqual(PAGE2);
    expect(state.nextCursor).toBe('cursor-page-2b');
    expect(state.filterUpdating).toBe(false);
    expect(state.statusMessage).toBe('1 jobs shown');
  });

  it('filter-failure keeps the previous items visible', () => {
    let state = createFeedPaginationState({
      items: PAGE1,
      nextCursor: 'cursor-page-2',
      hasNextPage: true,
    });
    state = feedPaginationReducer(state, { type: 'filter-start' });
    state = feedPaginationReducer(state, { type: 'filter-failure' });
    expect(state.filterError).toBe(true);
    expect(state.filterUpdating).toBe(false);
    expect(state.items).toEqual(PAGE1);
  });
});
