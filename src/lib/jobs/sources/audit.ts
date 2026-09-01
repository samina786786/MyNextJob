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
  if (error) throw new PersistenceError(error.message);

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
  title: string | null;
  remote_type: string | null;
  employment_type: string | null;
  country: string | null;
  freshness_at: string | null;
  discovered_at: string | null;
  company_id: string | null;
  job_source_postings?: { job_sources: { source_type: string } | { source_type: string }[] | null }[];
};

export async function buildCoverageReport(client: SupabaseClient): Promise<CoverageReport> {
  const now = new Date();
  const cutoff = catalogCutoff(now).toISOString();
  const { data: jobs, error } = await client
    .from('jobs')
    .select(
      'title, remote_type, employment_type, country, freshness_at, discovered_at, company_id',
    )
    .eq('status', 'open')
    .gte('freshness_at', cutoff)
    .limit(20_000);
  if (error) throw new PersistenceError(error.message);
  const jobRows = (jobs as JobRow[] | null) ?? [];

  // Provider attribution is derived from job_source_postings + job_sources.
  const jobIds = jobRows
    .map((row) => (row as unknown as { id?: string }).id)
    .filter((id): id is string => typeof id === 'string');
  const byProvider: Record<string, number> = {};
  if (jobIds.length > 0) {
    // Fetch attribution in the same fashion the feed does.
    const { data: postings, error: postErr } = await client
      .from('job_source_postings')
      .select('job_id, job_sources(source_type)')
      .in('job_id', jobIds);
    if (!postErr) {
      const seen = new Set<string>();
      type PostingRow = { job_id: string; job_sources: { source_type: string } | { source_type: string }[] | null };
      for (const row of (postings as PostingRow[] | null) ?? []) {
        if (seen.has(row.job_id)) continue;
        seen.add(row.job_id);
        const rel = Array.isArray(row.job_sources) ? row.job_sources[0] : row.job_sources;
        const type = rel?.source_type ?? 'unknown';
        byProvider[type] = (byProvider[type] ?? 0) + 1;
      }
    }
  }

  const byWorkMode: Record<string, number> = {};
  const byEmploymentType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const roleFamiliesHeuristic: Record<string, number> = {};
  const byFreshness = { last24h: 0, last7d: 0, last14d: 0, last30d: 0 };
  const companiesFresh = new Set<string>();
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
  }

  let companiesWithDomain = 0;
  let companiesWithoutDomain = 0;
  const logoStatus = { ready: 0, pending: 0, unresolved: 0, failed: 0 };
  if (companiesFresh.size > 0) {
    const { data: companies, error: coErr } = await client
      .from('companies')
      .select('id, domain, logo_status')
      .in('id', [...companiesFresh]);
    if (!coErr) {
      type CompanyRow = { domain: string | null; logo_status: string | null };
      for (const row of (companies as CompanyRow[] | null) ?? []) {
        if (row.domain && row.domain.trim().length > 0) companiesWithDomain += 1;
        else companiesWithoutDomain += 1;
        const status = row.logo_status as keyof typeof logoStatus | null;
        if (status && logoStatus[status] !== undefined) logoStatus[status] += 1;
      }
    }
  }

  return {
    freshOpenJobs: jobRows.length,
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
