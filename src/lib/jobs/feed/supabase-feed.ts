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
 * Two layers of grammar sit between a user's search string and the row:
 *
 *   1. PostgREST URL grammar. In `.or('a.ilike.pat,b.ilike.pat')` the
 *      comma separates operands and `(` / `)` group `and(…)` / `not(…)`.
 *      Inside a PostgREST value, `*` is the URL-safe alias for `%`.
 *   2. SQL LIKE / ILIKE grammar. `%` matches any run of characters, `_`
 *      matches exactly one, and `\` is the default escape character in
 *      PostgreSQL.
 *
 * PostgREST does NOT strip `%` / `_` — a raw `%` in the pattern reaches
 * PostgreSQL as a SQL wildcard, so user input like `50%` would silently
 * match "50 anything". Similarly `_data` would match `Xdata`, and `\` in
 * user input would be interpreted as an escape character by the SQL
 * engine.
 *
 * Rather than emitting `LIKE ... ESCAPE '\'` — which PostgREST does not
 * currently expose — we normalize every user-controlled LIKE
 * metacharacter to a single space. `%foo%bar%` becomes ` foo bar `,
 * which after trimming and space collapsing is the pattern `*foo bar*`.
 * That means:
 *   * `%` / `_` / `\` never act as wildcards
 *   * `,` / `(` / `)` cannot widen the OR grammar
 *   * `*` cannot be smuggled in as an alternate wildcard
 * Unicode letters, digits, dashes, quotes, and every other non-listed
 * character pass through untouched. Behaviour is deterministic — the
 * same input string always produces the same LIKE substring pattern.
 */
const LIKE_UNSAFE = /[%_\\,()*]/g;
const WHITESPACE_COLLAPSE = /\s+/g;

/** Exported for direct unit tests of the escape contract. */
export function escapePostgrestLikeSubstring(value: string): string {
  return value.replace(LIKE_UNSAFE, ' ').replace(WHITESPACE_COLLAPSE, ' ').trim();
}

function ilikeSubstring(value: string): string {
  const escaped = escapePostgrestLikeSubstring(value);
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
  // The preflight also uses ILIKE, so LIKE-metacharacters ('%', '_') must be
  // neutralized the same way as in the main jobs query.
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
}>(query: Q, input: FilterInput): Q {
  let q: Q = query;

  if (input.filters.work.length > 0) {
    q = q.in('remote_type', input.filters.work);
  }
  if (input.filters.employment.length > 0) {
    q = q.in('employment_type', input.filters.employment);
  }

  // Location: match any of the three text fields with a case-insensitive
  // substring. Escaping keeps user input from breaking the OR expression.
  if (input.filters.location) {
    const pattern = ilikeSubstring(input.filters.location);
    q = q.or(
      [
        `location_text.ilike.${pattern}`,
        `city.ilike.${pattern}`,
        `country.ilike.${pattern}`,
      ].join(','),
    );
  }

  // Text search: match title OR any company_id resolved from the company
  // preflight. If neither leg would match anything, filter to zero rows so
  // the empty state is returned.
  if (input.filters.q) {
    const titlePattern = ilikeSubstring(input.filters.q);
    const legs: string[] = [`title.ilike.${titlePattern}`];
    if (input.companyIds.length > 0) {
      legs.push(`company_id.in.(${input.companyIds.join(',')})`);
    }
    q = q.or(legs.join(','));
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
