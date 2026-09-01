import type { SupabaseClient } from '@supabase/supabase-js';

import { clampFeedLimit, decodeFeedCursor, encodeFeedCursor } from '@/lib/jobs/feed/cursor';
import {
  COMPANY_FEED_EMBED_NAME_ONLY,
  COMPANY_FEED_EMBED_WITH_LOGO,
  isMissingCompanyLogoColumn,
  readCompanyFeedFields,
  type CompanyFeedEmbedRow,
} from '@/lib/jobs/feed/company-fields';
import {
  DEFAULT_AGE_DAYS,
  EMPTY_FEED_FILTERS,
  escapePostgrestLikeSubstring,
  hasNonQueryFilters,
  type FeedFilters,
} from '@/lib/jobs/feed/filters';
import type { FeedJob, FreshJobsPage } from '@/lib/jobs/feed/types';
import { catalogCutoff } from '@/lib/jobs/freshness';
import { PersistenceError } from '@/lib/jobs/errors';
import type { EmploymentType, JobStatus, RemoteType, SalaryPeriod } from '@/lib/jobs/types';

const FEED_COLUMNS = [
  'id',
  'company_id',
  'title',
  'location_text',
  'city',
  'country',
  'remote_type',
  'employment_type',
  'salary_min',
  'salary_max',
  'salary_currency',
  'salary_period',
  'published_at',
  'discovered_at',
  'freshness_at',
  'status',
  'apply_url',
  'source_url',
] as const;

const FEED_SELECT_WITH_LOGO = [...FEED_COLUMNS, COMPANY_FEED_EMBED_WITH_LOGO].join(',');
const FEED_SELECT_NAME_ONLY = [...FEED_COLUMNS, COMPANY_FEED_EMBED_NAME_ONLY].join(',');

/**
 * PostgREST OR-grammar and SQL LIKE-grammar metacharacters are both
 * neutralized in `escapePostgrestLikeSubstring` (defined in
 * `@/lib/jobs/feed/filters` so the same rule runs on both the URL parser
 * and the repository).
 *
 * `safeIlikeSubstring` returns `null` when the sanitized stem is empty
 * — the caller must then emit no ILIKE predicate and fall back to a
 * zero-match sentinel instead of `ILIKE '%%'`, which would silently
 * match the entire catalog.
 */
function safeIlikeSubstring(value: string): string | null {
  const escaped = escapePostgrestLikeSubstring(value);
  if (escaped.length === 0) return null;
  return `*${escaped}*`;
}

type FeedRow = {
  id: string;
  company_id: string | null;
  title: string;
  location_text: string | null;
  city: string | null;
  country: string | null;
  remote_type: RemoteType | null;
  employment_type: EmploymentType | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  published_at: string | null;
  discovered_at: string;
  freshness_at: string;
  status: JobStatus;
  apply_url: string | null;
  source_url: string | null;
  companies: CompanyFeedEmbedRow | CompanyFeedEmbedRow[] | null;
};

function ageAwareCutoff(now: Date, ageDays: number): string {
  const clamped = Math.max(1, Math.min(30, Math.floor(ageDays)));
  if (clamped === DEFAULT_AGE_DAYS) return catalogCutoff(now).toISOString();
  return new Date(now.getTime() - clamped * 24 * 60 * 60 * 1000).toISOString();
}

async function resolveCompanyIdsForQuery(
  client: SupabaseClient,
  q: string,
): Promise<string[]> {
  // Defense-in-depth: the parser is expected to gate this out via
  // normalizeSearchQuery, but if a caller ever hands us a metacharacter-
  // only string we must not preflight against `ILIKE '%%'` (which would
  // return every company row up to the limit).
  const escaped = escapePostgrestLikeSubstring(q);
  if (!escaped) return [];
  const { data, error } = await client
    .from('companies')
    .select('id')
    .ilike('name', `%${escaped}%`)
    .limit(200);
  if (error) throw new PersistenceError(error.message);
  return ((data as { id: string }[] | null) ?? []).map((row) => row.id);
}

/**
 * Live keyset page. Requires migration 0010 (freshness_at).
 * Uses the service-role client; never returns raw_payload or hashes.
 * Logo columns require 0012; older schemas fall back to company name only.
 * Filter indexes (0013) accelerate the queries but the code works without
 * them (trigram indexes are used automatically when present).
 */
export async function getFreshJobsPageFromClient(
  client: SupabaseClient,
  input: {
    limit?: number;
    cursor?: string | null;
    now?: Date;
    filters?: FeedFilters;
  } = {},
): Promise<FreshJobsPage> {
  const now = input.now ?? new Date();
  const limit = clampFeedLimit(input.limit);
  const filters = input.filters ?? EMPTY_FEED_FILTERS;
  const cutoff = ageAwareCutoff(now, filters.age);
  const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;

  // Company-name search is resolved as a small preflight so the jobs OR
  // predicate stays parameterizable and can hit trigram indexes on
  // lower(title) and lower(companies.name) independently.
  let companyIds: string[] = [];
  if (filters.q) {
    companyIds = await resolveCompanyIdsForQuery(client, filters.q);
  }

  const buildQuery = (select: string) =>
    applyFilters(
      client
        .from('jobs')
        .select(select)
        .eq('status', 'open')
        .gte('freshness_at', cutoff)
        .order('freshness_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1),
      { cursor, filters, companyIds },
    );

  const first = await buildQuery(FEED_SELECT_WITH_LOGO);
  let data = first.data;
  let error = first.error;
  if (error && isMissingCompanyLogoColumn(error.message)) {
    const retry = await buildQuery(FEED_SELECT_NAME_ONLY);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new PersistenceError(
      error.message.includes('freshness_at')
        ? 'Feed query requires migration 0010 (jobs.freshness_at).'
        : error.message,
    );
  }

  const rows = (data as FeedRow[] | null) ?? [];
  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const jobs: FeedJob[] = page.map((row) => {
    const company = readCompanyFeedFields(row.companies);
    const freshness = new Date(row.freshness_at);
    return {
      id: row.id,
      companyId: row.company_id,
      companyName: company.name,
      companyLogoUrl: company.logoUrl,
      title: row.title,
      locationText: row.location_text,
      city: row.city,
      region: null,
      country: row.country,
      remoteType: row.remote_type,
      employmentType: row.employment_type,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryCurrency: row.salary_currency,
      salaryPeriod: row.salary_period,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      discoveredAt: new Date(row.discovered_at),
      freshnessAt: freshness,
      status: row.status,
      applyUrl: row.apply_url,
      sourceUrl: row.source_url,
    };
  });
  const last = jobs[jobs.length - 1];
  return {
    jobs,
    hasNextPage,
    limit,
    nextCursor:
      hasNextPage && last ? encodeFeedCursor({ freshnessAt: last.freshnessAt, id: last.id }) : null,
  };
}

type FilterInput = {
  cursor: { freshnessAt: Date; id: string } | null;
  filters: FeedFilters;
  companyIds: string[];
};

// Use a generic Q so we don't need to import Supabase's private builder types.
function applyFilters<Q extends {
  in: (col: string, values: readonly string[]) => Q;
  or: (expr: string) => Q;
  is: (col: string, value: null | boolean) => Q;
}>(query: Q, input: FilterInput): Q {
  let q: Q = query;

  if (input.filters.work.length > 0) {
    q = q.in('remote_type', input.filters.work);
  }
  if (input.filters.employment.length > 0) {
    q = q.in('employment_type', input.filters.employment);
  }

  // Location: match any of the three text fields with a case-insensitive
  // substring. Sanitize first — if the pattern collapses to empty (the
  // user typed only metacharacters like `%%`), do not emit an OR that
  // reduces to `ILIKE '%%'` on all three columns. Force zero results
  // instead: an `id IS NULL` predicate always matches nothing and is
  // preferable to silently dropping the filter and returning the whole
  // catalog.
  if (input.filters.location) {
    const pattern = safeIlikeSubstring(input.filters.location);
    if (pattern === null) {
      q = q.is('id', null);
    } else {
      q = q.or(
        [
          `location_text.ilike.${pattern}`,
          `city.ilike.${pattern}`,
          `country.ilike.${pattern}`,
        ].join(','),
      );
    }
  }

  // Text search: match title OR any company_id resolved from the company
  // preflight. Same empty-pattern gate applies — if the sanitized title
  // stem is empty AND no companies matched the preflight, produce a
  // deterministic zero-row result rather than an accidental match-all.
  if (input.filters.q) {
    const titlePattern = safeIlikeSubstring(input.filters.q);
    const legs: string[] = [];
    if (titlePattern !== null) legs.push(`title.ilike.${titlePattern}`);
    if (input.companyIds.length > 0) {
      legs.push(`company_id.in.(${input.companyIds.join(',')})`);
    }
    if (legs.length === 0) {
      q = q.is('id', null);
    } else {
      q = q.or(legs.join(','));
    }
  }

  if (input.cursor) {
    const t = input.cursor.freshnessAt.toISOString();
    q = q.or(
      `freshness_at.lt."${t}",and(freshness_at.eq."${t}",id.lt.${input.cursor.id})`,
    );
  }

  return q;
}

/**
 * Convenience: filters that would benefit from index-supported queries.
 * Exported so callers can attach targeted cache-tag arms — Phase 5D uses
 * this to distinguish an unfiltered request from a filtered one when
 * choosing cache lifetimes.
 */
export function feedHasFilters(filters: FeedFilters): boolean {
  return filters.q !== null || filters.location !== null || hasNonQueryFilters(filters);
}
