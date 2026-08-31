import type { SupabaseClient } from '@supabase/supabase-js';

import { clampFeedLimit, decodeFeedCursor, encodeFeedCursor } from '@/lib/jobs/feed/cursor';
import type { FeedJob, FreshJobsPage } from '@/lib/jobs/feed/types';
import { catalogCutoff } from '@/lib/jobs/freshness';
import { PersistenceError } from '@/lib/jobs/errors';
import type { EmploymentType, JobStatus, RemoteType, SalaryPeriod } from '@/lib/jobs/types';

const FEED_SELECT = [
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
  'companies(name)',
].join(',');

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
  companies: { name: string } | { name: string }[] | null;
};

/**
 * Live keyset page. Requires migration 0010 (freshness_at).
 * Uses the service-role client; never returns raw_payload or hashes.
 */
export async function getFreshJobsPageFromClient(
  client: SupabaseClient,
  input: { limit?: number; cursor?: string | null; now?: Date } = {},
): Promise<FreshJobsPage> {
  const now = input.now ?? new Date();
  const limit = clampFeedLimit(input.limit);
  const cutoff = catalogCutoff(now).toISOString();
  const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;

  let query = client
    .from('jobs')
    .select(FEED_SELECT)
    .eq('status', 'open')
    .gte('freshness_at', cutoff)
    .order('freshness_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    const t = cursor.freshnessAt.toISOString();
    query = query.or(
      `freshness_at.lt."${t}",and(freshness_at.eq."${t}",id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new PersistenceError(
      error.message.includes('freshness_at')
        ? 'Feed query requires migration 0010 (jobs.freshness_at).'
        : error.message,
    );
  }

  const rows = (data as unknown as FeedRow[] | null) ?? [];
  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const jobs: FeedJob[] = page.map((row) => {
    const related = row.companies;
    const companyName = Array.isArray(related) ? related[0]?.name ?? null : related?.name ?? null;
    const freshness = new Date(row.freshness_at);
    return {
      id: row.id,
      companyId: row.company_id,
      companyName,
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
