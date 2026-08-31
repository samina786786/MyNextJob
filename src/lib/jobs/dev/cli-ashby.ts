import 'server-only';

import { AshbyAdapter } from '@/lib/jobs/adapters/ashby';
import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { jobFingerprint } from '@/lib/jobs/engine/fingerprint';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { AdapterFetchError, PersistenceError } from '@/lib/jobs/errors';
import { logJobEngine } from '@/lib/jobs/logging';
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
  pnpm jobs:ashby --source=<uuid-or-board> [--dry-run]
  pnpm jobs:ashby --all [--dry-run]

Dry run fetches, validates, filters unlisted jobs, normalizes, and fingerprints. It does not write to Supabase.
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
    return store.listJobSources({ sourceType: 'ashby', enabled: true });
  }
  if (!options.source) {
    printUsage();
    process.exit(1);
  }
  if (UUID_RE.test(options.source)) {
    const byId = await store.getJobSource(options.source);
    if (!byId) throw new PersistenceError(`Unknown job source ${options.source}`);
    return [byId];
  }
  const byBoard = await store.findJobSourceByExternalIdentifier('ashby', options.source);
  if (!byBoard) {
    throw new PersistenceError(
      `No Ashby source with board "${options.source}". Apply 0008 or pass a source UUID.`,
    );
  }
  return [byBoard];
}

function numberMeta(metadata: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : fallback;
}

function stringMeta(metadata: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function formatAshbyDryRunReport(args: {
  sourceName: string;
  boardName: string;
  apiVersion: string;
  fetched: number;
  listed: number;
  unlistedSkipped: number;
  jobs: Awaited<ReturnType<AshbyAdapter['fetchJobs']>>['jobs'];
  snapshotComplete: boolean;
}): string {
  let accepted = 0;
  let rejected = 0;
  const samples: { title: string; location: string; remoteType: string }[] = [];

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
      if (samples.length < 3) {
        samples.push({
          title: prepared.title,
          location: prepared.locationText ?? '(no location)',
          remoteType: prepared.remoteType,
        });
      }
    } catch {
      rejected += 1;
    }
  }

  const lines = [
    `Source: ${args.sourceName}`,
    'Provider: Ashby',
    `Board: ${args.boardName}`,
    `API version: ${args.apiVersion}`,
    `Fetched: ${args.fetched}`,
    `Listed: ${args.listed}`,
    `Accepted: ${accepted}`,
    `Rejected: ${rejected}`,
    `Unlisted skipped: ${args.unlistedSkipped}`,
    `Snapshot: ${args.snapshotComplete ? 'complete' : 'incomplete'}`,
  ];
  if (samples.length > 0) {
    lines.push('Sample:');
    for (const sample of samples) {
      lines.push(`  ${sample.title}`);
      lines.push(`  ${sample.location}`);
      lines.push(`  ${sample.remoteType}`);
    }
  }
  return lines.join('\n');
}

function reportFromResult(
  sourceName: string,
  boardName: string,
  result: Awaited<ReturnType<AshbyAdapter['fetchJobs']>>,
): string {
  return formatAshbyDryRunReport({
    sourceName,
    boardName,
    apiVersion: stringMeta(result.metadata, 'apiVersion', 'unknown'),
    fetched: numberMeta(result.metadata, 'fetched', result.jobs.length),
    listed: numberMeta(result.metadata, 'listed', result.jobs.length),
    unlistedSkipped: numberMeta(result.metadata, 'unlistedSkipped', 0),
    jobs: result.jobs,
    snapshotComplete: result.snapshotComplete,
  });
}

async function dryRunTokenOnly(boardName: string): Promise<void> {
  const adapter = new AshbyAdapter({ boardName });
  const result = await adapter.fetchJobs({
    sourceId: '00000000-0000-4000-8000-000000000001',
    sourceName: boardName,
    externalIdentifier: boardName,
    companyName: boardName,
  });
  console.log(reportFromResult(boardName, boardName, result));
}

async function runDryRun(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const boardName = source.externalIdentifier;
  if (!boardName) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (Ashby board name)`);
  }
  const company = source.companyId ? await store.findCompanyById(source.companyId) : null;
  const adapter = new AshbyAdapter({ boardName });
  const result = await adapter.fetchJobs({
    sourceId: source.id,
    sourceName: source.name,
    externalIdentifier: boardName,
    companyId: source.companyId,
    companyName: company?.name ?? source.name,
    companyDomain: company?.domain ?? null,
    metadata: source.metadata,
  });
  console.log(reportFromResult(company?.name ?? source.name, boardName, result));
}

async function runLive(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const boardName = source.externalIdentifier;
  if (!boardName) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (Ashby board name)`);
  }
  const started = Date.now();
  const adapter = new AshbyAdapter({ boardName });
  try {
    const result = await syncJobSource(store, source.id, adapter);
    logJobEngine('ashby_source_sync_completed', {
      sourceId: source.id,
      boardName,
      fetched: result.metrics.fetched,
      accepted: result.metrics.accepted,
      rejected: result.metrics.rejected,
      durationMs: Date.now() - started,
    });
    console.log(`Source: ${source.name}`);
    console.log('Provider: Ashby');
    console.log(`Board: ${boardName}`);
    console.log(`Status: ${result.status}`);
    console.log(`Fetched: ${result.metrics.fetched}`);
    console.log(`Accepted: ${result.metrics.accepted}`);
    console.log(`Rejected: ${result.metrics.rejected}`);
    console.log(`Created: ${result.metrics.canonicalJobsCreated}`);
    console.log(`Updated: ${result.metrics.canonicalJobsUpdated}`);
    console.log(`Unchanged: ${result.metrics.unchanged}`);
    console.log(`Snapshot: ${result.metrics.snapshotComplete ? 'complete' : 'incomplete'}`);
    if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
  } catch (error) {
    logJobEngine('ashby_source_sync_failed', {
      sourceId: source.id,
      boardName,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);
  if (!options.all && !options.source) {
    printUsage();
    process.exit(1);
  }

  if (options.dryRun && options.source && !options.all) {
    if (getSupabaseSecretEnv().isConfigured) {
      const store = createLiveStore();
      const byToken = UUID_RE.test(options.source)
        ? await store.getJobSource(options.source)
        : await store.findJobSourceByExternalIdentifier('ashby', options.source);
      if (byToken) {
        await runDryRun(store, byToken);
        return;
      }
    }
    await dryRunTokenOnly(options.source);
    return;
  }

  const store = createLiveStore();
  const sources = await resolveSources(store, options);
  if (sources.length === 0) {
    throw new PersistenceError('No enabled Ashby sources found. Apply migration 0008 first.');
  }

  for (const source of sources) {
    if (options.dryRun) {
      await runDryRun(store, source);
    } else {
      await runLive(store, source);
    }
  }
}
