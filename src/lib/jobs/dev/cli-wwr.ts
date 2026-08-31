import 'server-only';

import { WwrAdapter } from '@/lib/jobs/adapters/we-work-remotely';
import { WWR_SOURCE_IDENTIFIER } from '@/lib/jobs/adapters/wwr-http';
import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { jobFingerprint } from '@/lib/jobs/engine/fingerprint';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { AdapterFetchError, PersistenceError } from '@/lib/jobs/errors';
import { logJobEngine } from '@/lib/jobs/logging';
import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CliOptions = {
  source?: string;
  all: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { all: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length).trim();
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return options;
}

function printUsage(): void {
  console.log(`Usage:
  pnpm jobs:wwr [--source=<uuid-or-weworkremotely-all>] [--dry-run]
  pnpm jobs:wwr --all [--dry-run]

Dry run fetches the official all-jobs RSS, parses, normalizes, and fingerprints. It does not write to Supabase.
Live run uses SupabaseJobStore and the Phase 3 sync engine.`);
}

function createLiveStore(): SupabaseJobStore {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required for live ingestion.');
  }
  return new SupabaseJobStore(createAdminClient());
}

async function resolveSources(store: SupabaseJobStore, options: CliOptions): Promise<JobSourceRecord[]> {
  if (options.all) {
    return store.listJobSources({ sourceType: 'we_work_remotely', enabled: true });
  }
  const needle = options.source ?? WWR_SOURCE_IDENTIFIER;
  if (UUID_RE.test(needle)) {
    const byId = await store.getJobSource(needle);
    if (!byId) throw new PersistenceError(`Unknown job source ${needle}`);
    return [byId];
  }
  const byId = await store.findJobSourceByExternalIdentifier('we_work_remotely', needle);
  if (!byId) {
    throw new PersistenceError(
      `No WWR source with identifier "${needle}". Apply 0009 or pass a source UUID.`,
    );
  }
  return [byId];
}

function numberMeta(metadata: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : fallback;
}

export function formatWwrDryRunReport(args: {
  sourceName: string;
  jobs: Awaited<ReturnType<WwrAdapter['fetchJobs']>>['jobs'];
  snapshotComplete: boolean;
  fetched: number;
  bytes: number;
  publishedDates: number;
  existingMatches?: number;
  newCandidates?: number;
  ambiguousNames?: number;
}): string {
  let accepted = 0;
  let rejected = 0;
  const employers = new Set<string>();
  const samples: { title: string; company: string; location: string }[] = [];

  for (const raw of args.jobs) {
    try {
      const prepared = prepareNormalizedJob({
        ...raw,
        source: {
          sourceId: raw.source?.sourceId || '00000000-0000-4000-8000-000000000001',
          externalId: raw.source?.externalId ?? '',
        },
      });
      jobFingerprint(prepared);
      accepted += 1;
      employers.add(prepared.companyName);
      if (samples.length < 3) {
        samples.push({
          title: prepared.title,
          company: prepared.companyName,
          location: prepared.locationText ?? '(no location)',
        });
      }
    } catch {
      rejected += 1;
    }
  }

  const lines = [
    `Source: ${args.sourceName}`,
    'Format: RSS',
    `Fetched: ${args.fetched}`,
    `Accepted: ${accepted}`,
    `Rejected: ${rejected}`,
    `Companies observed: ${employers.size}`,
    `Existing-company matches: ${args.existingMatches ?? 0}`,
    `New-company candidates: ${args.newCandidates ?? employers.size}`,
    `Ambiguous names: ${args.ambiguousNames ?? 0}`,
    `Snapshot: ${args.snapshotComplete ? 'complete' : 'incomplete'}`,
    `Feed bytes: ${args.bytes}`,
    `Published dates: ${args.publishedDates > 0 ? 'yes' : 'no'}`,
  ];
  if (samples.length > 0) {
    lines.push('Sample:');
    for (const sample of samples) {
      lines.push(`  ${sample.title}`);
      lines.push(`  ${sample.company}`);
      lines.push(`  ${sample.location}`);
      lines.push('  Remote');
    }
  }
  return lines.join('\n');
}

async function companyStats(
  store: SupabaseJobStore | null,
  jobs: Awaited<ReturnType<WwrAdapter['fetchJobs']>>['jobs'],
): Promise<{ existingMatches: number; newCandidates: number; ambiguousNames: number }> {
  const names = new Set<string>();
  for (const job of jobs) {
    if (job.company?.name?.trim()) names.add(job.company.name.trim());
  }
  if (!store) {
    return { existingMatches: 0, newCandidates: names.size, ambiguousNames: 0 };
  }
  let existingMatches = 0;
  let newCandidates = 0;
  let ambiguousNames = 0;
  for (const name of names) {
    const matches = await store.findCompaniesByNameKey(normalizeCompanyName(name));
    if (matches.length === 1) existingMatches += 1;
    else if (matches.length > 1) ambiguousNames += 1;
    else newCandidates += 1;
  }
  return { existingMatches, newCandidates, ambiguousNames };
}

function reportFromResult(
  sourceName: string,
  result: Awaited<ReturnType<WwrAdapter['fetchJobs']>>,
  stats: { existingMatches: number; newCandidates: number; ambiguousNames: number },
): string {
  return formatWwrDryRunReport({
    sourceName,
    jobs: result.jobs,
    snapshotComplete: result.snapshotComplete,
    fetched: numberMeta(result.metadata, 'fetched', result.jobs.length),
    bytes: numberMeta(result.metadata, 'bytes', 0),
    publishedDates: numberMeta(result.metadata, 'publishedDates', 0),
    ...stats,
  });
}

async function dryRunFeedOnly(): Promise<void> {
  const adapter = new WwrAdapter();
  const result = await adapter.fetchJobs({
    sourceId: '00000000-0000-4000-8000-000000000001',
    sourceName: 'We Work Remotely',
    externalIdentifier: WWR_SOURCE_IDENTIFIER,
    companyName: 'We Work Remotely',
  });
  const stats = await companyStats(null, result.jobs);
  console.log(reportFromResult('We Work Remotely', result, stats));
}

async function runDryRun(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const adapter = new WwrAdapter();
  const result = await adapter.fetchJobs({
    sourceId: source.id,
    sourceName: source.name,
    externalIdentifier: source.externalIdentifier,
    companyId: source.companyId,
    companyName: source.name,
    metadata: source.metadata,
  });
  const stats = await companyStats(store, result.jobs);
  console.log(reportFromResult(source.name, result, stats));
}

async function runLive(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const started = Date.now();
  const adapter = new WwrAdapter();
  try {
    const result = await syncJobSource(store, source.id, adapter);
    logJobEngine('wwr_source_sync_completed', {
      sourceId: source.id,
      fetched: result.metrics.fetched,
      accepted: result.metrics.accepted,
      rejected: result.metrics.rejected,
      durationMs: Date.now() - started,
    });
    console.log(`Source: ${source.name}`);
    console.log('Format: RSS');
    console.log(`Status: ${result.status}`);
    console.log(`Fetched: ${result.metrics.fetched}`);
    console.log(`Accepted: ${result.metrics.accepted}`);
    console.log(`Rejected: ${result.metrics.rejected}`);
    console.log(`Stale skipped: ${result.metrics.staleSkipped}`);
    console.log(`Created: ${result.metrics.canonicalJobsCreated}`);
    console.log(`Updated: ${result.metrics.canonicalJobsUpdated}`);
    console.log(`Unchanged: ${result.metrics.unchanged}`);
    console.log(`Snapshot: ${result.metrics.snapshotComplete ? 'complete' : 'incomplete'}`);
    console.log(`Duration: ${Date.now() - started}ms`);
    const timings = result.metrics.timings;
    if (timings) {
      console.log(`Fetch: ${timings.fetchMs}ms`);
      console.log(`Prefetch: ${timings.prefetchMs}ms (${timings.postingPrefetch} postings)`);
      console.log(`Persist: ${timings.persistMs}ms`);
      console.log(`Lifecycle: ${timings.lifecycleMs}ms`);
      console.log(`Company lookups: ${timings.companyLookups}`);
      console.log(`Batched touches: ${timings.batchedTouches}`);
    }
    if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
  } catch (error) {
    logJobEngine('wwr_source_sync_failed', {
      sourceId: source.id,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);

  if (options.dryRun && !options.all) {
    if (getSupabaseSecretEnv().isConfigured) {
      try {
        const store = createLiveStore();
        const needle = options.source ?? WWR_SOURCE_IDENTIFIER;
        const byToken = UUID_RE.test(needle)
          ? await store.getJobSource(needle)
          : await store.findJobSourceByExternalIdentifier('we_work_remotely', needle);
        if (byToken) {
          await runDryRun(store, byToken);
          return;
        }
      } catch (error) {
        if (!(error instanceof PersistenceError) && !(error instanceof AdapterFetchError)) {
          throw error;
        }
      }
    }
    await dryRunFeedOnly();
    return;
  }

  const store = createLiveStore();
  const sources = await resolveSources(store, options);
  if (sources.length === 0) {
    throw new PersistenceError('No enabled WWR sources found. Apply migration 0009 first.');
  }

  for (const source of sources) {
    if (options.dryRun) {
      await runDryRun(store, source);
    } else {
      await runLive(store, source);
    }
  }
}
