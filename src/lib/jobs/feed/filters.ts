import type { EmploymentType, RemoteType } from '@/lib/jobs/types';

/**
 * Canonical filter contract. One parser + one serializer used by:
 *   - server initial page render (searchParams)
 *   - GET /api/jobs/feed
 *   - shared catalog cache key
 *   - client URL builder
 *
 * All comparisons are performed in normalized form so semantically-equivalent
 * URLs produce the same cache entry:
 *   /home?work=remote,hybrid == /home?work=hybrid,remote
 */

export const SEARCH_QUERY_MAX_LENGTH = 80;
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const LOCATION_MAX_LENGTH = 80;

export const WORK_MODE_VALUES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkModeFilter = (typeof WORK_MODE_VALUES)[number];

export const EMPLOYMENT_VALUES = [
  'full_time',
  'part_time',
  'contract',
  'freelance',
  'internship',
  'temporary',
] as const;
export type EmploymentFilter = (typeof EMPLOYMENT_VALUES)[number];

export const AGE_VALUES = [1, 7, 14, 30] as const;
export type AgeFilter = (typeof AGE_VALUES)[number];

export const DEFAULT_AGE_DAYS = 30;

export type FeedFilters = {
  q: string | null;
  work: WorkModeFilter[];
  employment: EmploymentFilter[];
  location: string | null;
  age: AgeFilter;
};

export const EMPTY_FEED_FILTERS: FeedFilters = {
  q: null,
  work: [],
  employment: [],
  location: null,
  age: DEFAULT_AGE_DAYS,
};

const WHITESPACE_RUN = /\s+/g;
const CONTROL_CHAR = /[\x00-\x1f\x7f]/g;

/** Trim, collapse internal whitespace, strip control characters, cap length. */
export function normalizeSearchQuery(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(CONTROL_CHAR, ' ').replace(WHITESPACE_RUN, ' ').trim();
  if (cleaned.length === 0) return null;
  const clipped = cleaned.slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (clipped.length < SEARCH_QUERY_MIN_LENGTH) return null;
  return clipped;
}

export function normalizeLocation(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(CONTROL_CHAR, ' ').replace(WHITESPACE_RUN, ' ').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, LOCATION_MAX_LENGTH);
}

function parseSet<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[],
): T[] {
  if (!raw) return [];
  const set = new Set<T>();
  for (const token of raw.split(',')) {
    const trimmed = token.trim().toLowerCase();
    if (!trimmed) continue;
    if ((allowed as readonly string[]).includes(trimmed)) {
      set.add(trimmed as T);
    }
  }
  return [...set].sort();
}

function parseAge(raw: string | null | undefined): AgeFilter {
  if (!raw) return DEFAULT_AGE_DAYS;
  const asNum = Number.parseInt(raw, 10);
  if (!Number.isFinite(asNum)) return DEFAULT_AGE_DAYS;
  if ((AGE_VALUES as readonly number[]).includes(asNum)) return asNum as AgeFilter;
  return DEFAULT_AGE_DAYS;
}

/**
 * Parse filter arguments from any URLSearchParams-like source.
 * Unknown params are ignored. Invalid values fall back to the default,
 * they never throw — the URL is user input.
 */
export function parseFeedFilters(input: URLSearchParams | Record<string, string | undefined>): FeedFilters {
  const get = (key: string): string | null => {
    if (input instanceof URLSearchParams) return input.get(key);
    const value = input[key];
    return typeof value === 'string' ? value : null;
  };
  return {
    q: normalizeSearchQuery(get('q')),
    work: parseSet(get('work'), WORK_MODE_VALUES),
    employment: parseSet(get('employment'), EMPLOYMENT_VALUES),
    location: normalizeLocation(get('location')),
    age: parseAge(get('age')),
  };
}

/**
 * Deterministic stable string for cache keys. Order-independent.
 * Empty when no filters are active. Do NOT include cursors here.
 */
export function feedFiltersCacheKey(filters: FeedFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(`q=${filters.q.toLowerCase()}`);
  if (filters.work.length > 0) parts.push(`work=${filters.work.join(',')}`);
  if (filters.employment.length > 0) parts.push(`employment=${filters.employment.join(',')}`);
  if (filters.location) parts.push(`location=${filters.location.toLowerCase()}`);
  if (filters.age !== DEFAULT_AGE_DAYS) parts.push(`age=${filters.age}`);
  return parts.join('|');
}

/**
 * Serialize into URLSearchParams for the client-side navigator. Defaults
 * are omitted so shareable URLs stay short. Ordering is stable.
 */
export function feedFiltersToSearchParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.work.length > 0) params.set('work', filters.work.join(','));
  if (filters.employment.length > 0) params.set('employment', filters.employment.join(','));
  if (filters.location) params.set('location', filters.location);
  if (filters.age !== DEFAULT_AGE_DAYS) params.set('age', String(filters.age));
  return params;
}

export function hasActiveFilters(filters: FeedFilters): boolean {
  return (
    filters.q !== null ||
    filters.work.length > 0 ||
    filters.employment.length > 0 ||
    filters.location !== null ||
    filters.age !== DEFAULT_AGE_DAYS
  );
}

export function hasNonQueryFilters(filters: FeedFilters): boolean {
  return (
    filters.work.length > 0 ||
    filters.employment.length > 0 ||
    filters.location !== null ||
    filters.age !== DEFAULT_AGE_DAYS
  );
}

export function feedFiltersEqual(a: FeedFilters, b: FeedFilters): boolean {
  return feedFiltersCacheKey(a) === feedFiltersCacheKey(b);
}

/** Bridge from URL enum → engine RemoteType (same values today). */
export function workModeToRemoteType(value: WorkModeFilter): RemoteType {
  return value;
}

/** Bridge from URL enum → engine EmploymentType (same values today). */
export function employmentToDbValue(value: EmploymentFilter): EmploymentType {
  return value;
}
