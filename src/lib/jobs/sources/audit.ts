import type { SupabaseClient } from '@supabase/supabase-js';

import { PersistenceError } from '@/lib/jobs/errors';
import { catalogCutoff } from '@/lib/jobs/freshness';
import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import { findDuplicateSources, isSupportedProvider, validateSourceConfig } from '@/lib/jobs/sources/registry';

/**
 * Read-only registry + catalog reports. Never persists.
 *
 * The two reports intentionally share a module because they answer the
 * same operational question — "is the shared catalog healthy?" — from
 * different angles: registry health (job_sources) and catalog coverage
 * (jobs + companies).
 */

export type RegistryAuditReport = {
  totalSources: number;
  enabled: number;
  disabled: number;
  byProvider: Record<string, number>;
  invalidConfigs: { sourceId: string; reason: string }[];
  duplicates: { provider: string; identifier: string; ids: string[] }[];
  directSourcesWithoutCompany: { sourceId: string; provider: string; identifier: string | null }[];
  underBackoff: number;
  neverSynced: number;
};

export type CoverageReport = {
  freshOpenJobs: number;
  byProvider: Record<string, number>;
  byWorkMode: Record<string, number>;
  byEmploymentType: Record<string, number>;
  byFreshness: { last24h: number; last7d: number; last14d: number; last30d: number };
  byCountry: Record<string, number>;
  companiesFresh: number;
  companiesWithDomain: number;
  companiesWithoutDomain: number;
  logoStatus: { ready: number; pending: number; unresolved: number; failed: number };
  roleFamiliesHeuristic: Record<string, number>;
};

export async function buildRegistryAudit(
  client: SupabaseClient,
  sources: readonly JobSourceRecord[],
): Promise<RegistryAuditReport> {
  const now = new Date();
  const byProvider: Record<string, number> = {};
  const invalidConfigs: RegistryAuditReport['invalidConfigs'] = [];
  const directSourcesWithoutCompany: RegistryAuditReport['directSourcesWithoutCompany'] = [];
  let enabled = 0;
  let disabled = 0;
  let underBackoff = 0;
  let neverSynced = 0;

  for (const source of sources) {
    byProvider[source.sourceType] = (byProvider[source.sourceType] ?? 0) + 1;
    if (source.enabled) enabled += 1;
    else disabled += 1;
    if (source.lastSyncedAt == null) neverSynced += 1;
    if (source.nextSyncAt && source.nextSyncAt.getTime() > now.getTime()) underBackoff += 1;
    const validation = validateSourceConfig(source);
    if (!validation.valid) {
      invalidConfigs.push({ sourceId: source.id, reason: validation.message });
    }
    if (
      isSupportedProvider(source.sourceType as string) &&
      source.sourceType !== 'we_work_remotely' &&
      source.companyId == null
    ) {
      directSourcesWithoutCompany.push({
        sourceId: source.id,
        provider: source.sourceType,
        identifier: source.externalIdentifier,
      });
    }
  }

  const duplicates = findDuplicateSources(sources).map((row) => ({
    provider: row.provider,
    identifier: row.identifier,
    ids: row.ids,
  }));

  // Sanity read against the DB to prove the client is connected.
  const { error } = await client.from('job_sources').select('id', { head: true, count: 'exact' }).limit(1);
  if (error) throwCoverageError('registry audit preflight', error);

  return {
    totalSources: sources.length,
    enabled,
    disabled,
    byProvider,
    invalidConfigs,
    duplicates,
    directSourcesWithoutCompany,
    underBackoff,
    neverSynced,
  };
}

const ROLE_KEYWORDS: [family: string, RegExp][] = [
  ['software_engineering', /\b(engineer|developer|swe|programmer|frontend|backend|full[- ]?stack|mobile|ios|android)\b/i],
  ['data_ai', /\b(data (scientist|engineer|analyst)|ml|machine learning|ai\b|analytics|data science)\b/i],
  ['product', /\b(product manager|product owner|pm\b)\b/i],
  ['design_research', /\b(designer|ux|ui|research|design lead)\b/i],
  ['qa_testing', /\b(qa|quality assurance|test engineer|sdet)\b/i],
  ['devops_platform', /\b(devops|sre|platform|infrastructure|reliability|cloud engineer)\b/i],
  ['security', /\b(security|infosec|appsec|cybersecurity)\b/i],
  ['sales', /\b(sales|account executive|business development|bdr|sdr)\b/i],
  ['marketing', /\b(marketing|content|seo|brand|growth)\b/i],
  ['finance', /\b(finance|accounting|controller|treasury|fp&a)\b/i],
  ['hr_recruiting', /\b(recruit|talent|people ops|hrbp|human resources)\b/i],
  ['operations', /\b(operations|ops|logistics|supply chain)\b/i],
  ['customer', /\b(customer success|customer support|customer experience|support engineer)\b/i],
  ['project_program', /\b(project manager|program manager|scrum master|delivery)\b/i],
];

function classifyRole(title: string): string {
  for (const [family, re] of ROLE_KEYWORDS) if (re.test(title)) return family;
  return 'other';
}

type JobRow = {
  id: string;
  title: string | null;
  remote_type: string | null;
  employment_type: string | null;
  country: string | null;
  freshness_at: string | null;
  company_id: string | null;
};

/** Supabase / PostgREST caps a single response at ~1000 rows regardless of
 *  the `.limit()` argument. Coverage MUST iterate the full catalog, so we
 *  fetch card-level columns in 1000-row pages and stop when a page comes
 *  back short or we cover the exact total from `head + count`. Descriptions
 *  are deliberately never read. */
const COVERAGE_PAGE_SIZE = 1000;

/** Distinct from COVERAGE_PAGE_SIZE. A single `.in('col', values)` filter
 *  encodes every UUID into the request URL — 150 UUIDs is ~6 KB, safely
 *  under the typical Kong / PostgREST 8 KB request-line limit that
 *  produces HTTP 400 "Bad Request" for oversized `.in(...)` follow-ups.
 *  Row pagination stays at 1000; only the follow-up `.in()` chunking
 *  shrinks here. */
const IN_LIST_CHUNK_SIZE = 150;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/** Rich error propagation so a coverage 400 no longer surfaces as bare
 *  "Bad Request". Never logs authorization headers or secrets. */
function throwCoverageError(label: string, error: SupabaseErrorLike): never {
  const parts: string[] = [`${label} failed`];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.message) parts.push(`message=${error.message}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  throw new PersistenceError(parts.join(' | '));
}

/**
 * Preferred attribution provider — mirrors the product's `pickAttributionLabel`
 * ordering so a canonical job is counted exactly once under the winning
 * direct-employer ATS when both direct + aggregator evidence exists.
 * Lower rank wins.
 */
const PROVIDER_RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 1,
  ashby: 2,
  we_work_remotely: 50,
  rss: 51,
};

function preferredProvider(providers: readonly string[]): string {
  let best: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const p of providers) {
    const rank = PROVIDER_RANK[p] ?? 20;
    if (rank < bestRank) {
      bestRank = rank;
      best = p;
    }
  }
  return best ?? 'unknown';
}

async function fetchAllFreshJobsPaged(
  client: SupabaseClient,
  cutoffIso: string,
): Promise<{ rows: JobRow[]; totalReported: number }> {
  const rows: JobRow[] = [];
  const { count, error: countErr } = await client
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .gte('freshness_at', cutoffIso);
  if (countErr) throwCoverageError('coverage jobs exact-count', countErr);
  const totalReported = typeof count === 'number' ? count : 0;

  for (let offset = 0; ; offset += COVERAGE_PAGE_SIZE) {
    const { data, error } = await client
      .from('jobs')
      .select('id, title, remote_type, employment_type, country, freshness_at, company_id')
      .eq('status', 'open')
      .gte('freshness_at', cutoffIso)
      // Deterministic order so `range()` returns disjoint pages. The
      // ordering does not need to match the feed's keyset; it just needs
      // to be stable across paged requests.
      .order('freshness_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + COVERAGE_PAGE_SIZE - 1);
    if (error) throwCoverageError(`coverage jobs page offset=${offset}`, error);
    const page = (data as JobRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < COVERAGE_PAGE_SIZE) break;
    // Belt-and-suspenders — never loop past what the head-count promised.
    if (totalReported > 0 && rows.length >= totalReported) break;
  }
  return { rows, totalReported };
}

export async function buildCoverageReport(client: SupabaseClient): Promise<CoverageReport> {
  const now = new Date();
  const cutoff = catalogCutoff(now).toISOString();

  const { rows: jobRows, totalReported } = await fetchAllFreshJobsPaged(client, cutoff);

  const byWorkMode: Record<string, number> = {};
  const byEmploymentType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const roleFamiliesHeuristic: Record<string, number> = {};
  const byFreshness = { last24h: 0, last7d: 0, last14d: 0, last30d: 0 };
  const companiesFresh = new Set<string>();
  const jobIdOrder: string[] = [];
  for (const row of jobRows) {
    const wm = row.remote_type ?? 'unknown';
    byWorkMode[wm] = (byWorkMode[wm] ?? 0) + 1;
    const et = row.employment_type ?? 'unknown';
    byEmploymentType[et] = (byEmploymentType[et] ?? 0) + 1;
    const country = row.country?.trim() || 'unknown';
    byCountry[country] = (byCountry[country] ?? 0) + 1;
    const family = classifyRole(row.title ?? '');
    roleFamiliesHeuristic[family] = (roleFamiliesHeuristic[family] ?? 0) + 1;
    const fresh = row.freshness_at ? new Date(row.freshness_at).getTime() : NaN;
    if (Number.isFinite(fresh)) {
      const age = now.getTime() - fresh;
      const day = 24 * 60 * 60 * 1000;
      if (age <= day) byFreshness.last24h += 1;
      if (age <= 7 * day) byFreshness.last7d += 1;
      if (age <= 14 * day) byFreshness.last14d += 1;
      if (age <= 30 * day) byFreshness.last30d += 1;
    }
    if (row.company_id) companiesFresh.add(row.company_id);
    jobIdOrder.push(row.id);
  }

  // Provider attribution — "fresh canonical jobs by preferred attribution
  // provider". Each canonical job is counted exactly once under its
  // winning provider, using the same direct-employer-over-aggregator
  // precedence as the product's `pickAttributionLabel`. Follow-ups use
  // IN_LIST_CHUNK_SIZE (not COVERAGE_PAGE_SIZE) — a 1000-UUID .in() list
  // encodes to a ~37 KB URL and blows past Kong's request-line limit.
  const byProvider: Record<string, number> = {};
  if (jobIdOrder.length > 0) {
    const providersByJob = new Map<string, string[]>();
    for (let offset = 0; offset < jobIdOrder.length; offset += IN_LIST_CHUNK_SIZE) {
      const chunk = jobIdOrder.slice(offset, offset + IN_LIST_CHUNK_SIZE);
      const { data: postings, error: postErr } = await client
        .from('job_source_postings')
        .select('job_id, job_sources(source_type)')
        .in('job_id', chunk);
      if (postErr) {
        throwCoverageError(
          `coverage attribution chunk offset=${offset} size=${chunk.length}`,
          postErr,
        );
      }
      type PostingRow = { job_id: string; job_sources: { source_type: string } | { source_type: string }[] | null };
      for (const row of (postings as PostingRow[] | null) ?? []) {
        const rel = Array.isArray(row.job_sources) ? row.job_sources[0] : row.job_sources;
        const type = rel?.source_type ?? 'unknown';
        const list = providersByJob.get(row.job_id) ?? [];
        list.push(type);
        providersByJob.set(row.job_id, list);
      }
    }
    for (const id of jobIdOrder) {
      const providers = providersByJob.get(id) ?? [];
      const winner = providers.length > 0 ? preferredProvider(providers) : 'unattributed';
      byProvider[winner] = (byProvider[winner] ?? 0) + 1;
    }
  }

  let companiesWithDomain = 0;
  let companiesWithoutDomain = 0;
  const logoStatus = { ready: 0, pending: 0, unresolved: 0, failed: 0 };
  if (companiesFresh.size > 0) {
    const companyIds = [...companiesFresh];
    for (let offset = 0; offset < companyIds.length; offset += IN_LIST_CHUNK_SIZE) {
      const chunk = companyIds.slice(offset, offset + IN_LIST_CHUNK_SIZE);
      const { data: companies, error: coErr } = await client
        .from('companies')
        .select('id, domain, logo_status')
        .in('id', chunk);
      if (coErr) {
        throwCoverageError(
          `coverage companies chunk offset=${offset} size=${chunk.length}`,
          coErr,
        );
      }
      type CompanyRow = { domain: string | null; logo_status: string | null };
      for (const row of (companies as CompanyRow[] | null) ?? []) {
        if (row.domain && row.domain.trim().length > 0) companiesWithDomain += 1;
        else companiesWithoutDomain += 1;
        const status = row.logo_status as keyof typeof logoStatus | null;
        if (status && logoStatus[status] !== undefined) logoStatus[status] += 1;
      }
    }
  }

  // Prefer the paged sweep count — it is the source of truth for the
  // classification totals. Fall back to the head count if they diverge
  // for any reason so the report never claims a total smaller than
  // classified rows.
  const freshOpenJobs = Math.max(jobRows.length, totalReported);

  return {
    freshOpenJobs,
    byProvider,
    byWorkMode,
    byEmploymentType,
    byFreshness,
    byCountry,
    companiesFresh: companiesFresh.size,
    companiesWithDomain,
    companiesWithoutDomain,
    logoStatus,
    roleFamiliesHeuristic,
  };
}

export function formatAuditReport(report: RegistryAuditReport): string {
  const lines: string[] = [];
  lines.push('Source registry audit (READ-ONLY)');
  lines.push(`Total ${report.totalSources}  enabled=${report.enabled}  disabled=${report.disabled}  underBackoff=${report.underBackoff}  neverSynced=${report.neverSynced}`);
  const byProvider = Object.entries(report.byProvider)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
  if (byProvider) lines.push(`Providers: ${byProvider}`);
  if (report.invalidConfigs.length > 0) {
    lines.push('Invalid configs:');
    for (const invalid of report.invalidConfigs) lines.push(`  ${invalid.sourceId}: ${invalid.reason}`);
  }
  if (report.duplicates.length > 0) {
    lines.push('Duplicate provider identifiers:');
    for (const dup of report.duplicates) lines.push(`  ${dup.provider}::${dup.identifier} → ${dup.ids.join(', ')}`);
  }
  if (report.directSourcesWithoutCompany.length > 0) {
    lines.push('Direct sources missing canonical company:');
    for (const orphan of report.directSourcesWithoutCompany) {
      lines.push(`  ${orphan.sourceId} (${orphan.provider} ${orphan.identifier ?? '(no id)'})`);
    }
  }
  return lines.join('\n');
}

export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('Catalog coverage (fresh open jobs)');
  lines.push(`Total fresh open jobs: ${report.freshOpenJobs}`);
  lines.push(`Companies (fresh): ${report.companiesFresh}  withDomain=${report.companiesWithDomain}  withoutDomain=${report.companiesWithoutDomain}`);
  lines.push(`Logos: ready=${report.logoStatus.ready} pending=${report.logoStatus.pending} unresolved=${report.logoStatus.unresolved} failed=${report.logoStatus.failed}`);
  lines.push(`Freshness: 24h=${report.byFreshness.last24h} 7d=${report.byFreshness.last7d} 14d=${report.byFreshness.last14d} 30d=${report.byFreshness.last30d}`);
  lines.push(`Providers: ${formatMap(report.byProvider)}`);
  lines.push(`Work mode: ${formatMap(report.byWorkMode)}`);
  lines.push(`Employment: ${formatMap(report.byEmploymentType)}`);
  lines.push(`Countries (top 8): ${formatTop(report.byCountry, 8)}`);
  lines.push(`Role families (heuristic, admin-only): ${formatMap(report.roleFamiliesHeuristic)}`);
  return lines.join('\n');
}

function formatMap(map: Record<string, number>): string {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}

function formatTop(map: Record<string, number>, n: number): string {
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}
