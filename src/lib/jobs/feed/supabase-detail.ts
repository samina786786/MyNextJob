import type { SupabaseClient } from '@supabase/supabase-js';

import { getAttributionLabelsByJobIds } from '@/lib/jobs/feed/supabase-attribution';
import { catalogCutoff } from '@/lib/jobs/freshness';
import { PersistenceError } from '@/lib/jobs/errors';
import { isSafeHttpUrl } from '@/lib/jobs/normalization/normalize-urls';
import type { EmploymentType, JobStatus, RemoteType, SalaryPeriod } from '@/lib/jobs/types';

const DETAIL_SELECT = [
  'id',
  'company_id',
  'title',
  'location_text',
  'city',
  'country',
  'remote_type',
  'employment_type',
  'experience_min',
  'experience_max',
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
  'description_html',
  'description_text',
  'companies(name)',
].join(',');

type DetailRow = {
  id: string;
  company_id: string | null;
  title: string;
  location_text: string | null;
  city: string | null;
  country: string | null;
  remote_type: RemoteType | null;
  employment_type: EmploymentType | null;
  experience_min: number | null;
  experience_max: number | null;
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
  description_html: string | null;
  description_text: string | null;
  companies: { name: string } | { name: string }[] | null;
};

export type JobDetailDto = {
  id: string;
  companyName: string | null;
  title: string;
  locationText: string | null;
  city: string | null;
  country: string | null;
  remoteType: RemoteType | null;
  employmentType: EmploymentType | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  publishedAt: string | null;
  discoveredAt: string;
  freshnessAt: string;
  sourceLabel: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  applyUrl: string | null;
};

export function pickApplyUrl(applyUrl: string | null, sourceUrl: string | null): string | null {
  if (applyUrl && isSafeHttpUrl(applyUrl)) return applyUrl;
  if (sourceUrl && isSafeHttpUrl(sourceUrl)) return sourceUrl;
  return null;
}

function companyNameFrom(related: DetailRow['companies']): string | null {
  if (Array.isArray(related)) return related[0]?.name ?? null;
  return related?.name ?? null;
}

/**
 * Canonical job for /jobs/[id] when it is still in the active catalog.
 * Returns null for missing, closed, or stale rows.
 */
export async function getFreshJobDetailFromClient(
  client: SupabaseClient,
  jobId: string,
  now: Date = new Date(),
): Promise<JobDetailDto | null> {
  const cutoff = catalogCutoff(now).toISOString();
  const { data, error } = await client
    .from('jobs')
    .select(DETAIL_SELECT)
    .eq('id', jobId)
    .eq('status', 'open')
    .gte('freshness_at', cutoff)
    .maybeSingle();

  if (error) throw new PersistenceError(error.message);
  if (!data) return null;

  const row = data as unknown as DetailRow;
  const labels = await getAttributionLabelsByJobIds(client, [row.id]);

  return {
    id: row.id,
    companyName: companyNameFrom(row.companies),
    title: row.title,
    locationText: row.location_text,
    city: row.city,
    country: row.country,
    remoteType: row.remote_type,
    employmentType: row.employment_type,
    experienceMin: row.experience_min,
    experienceMax: row.experience_max,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    freshnessAt: row.freshness_at,
    sourceLabel: labels.get(row.id) ?? null,
    descriptionHtml: row.description_html,
    descriptionText: row.description_text,
    applyUrl: pickApplyUrl(row.apply_url, row.source_url),
  };
}
