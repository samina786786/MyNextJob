import 'server-only';

import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
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
  pnpm jobs:greenhouse --source=<uuid-or-token> [--dry-run]
  pnpm jobs:greenhouse --all [--dry-run]

Dry run fetches, validates, normalizes, and fingerprints. It does not write to Supabase.
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
    return store.listJobSources({ sourceType: 'greenhouse', enabled: true });
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
  const byToken = await store.findJobSourceByExternalIdentifier('greenhouse', options.source);
  if (!byToken) {
    throw new PersistenceError(
      `No Greenhouse source with board token "${options.source}". Apply 0006 or pass a source UUID.`,
    );
  }
  return [byToken];
}

export function formatDryRunReport(args: {
  sourceName: string;
  boardToken: string;
  jobs: Awaited<ReturnType<GreenhouseAdapter['fetchJobs']>>['jobs'];
  snapshotComplete: boolean;
}): string {
  let accepted = 0;
  let rejected = 0;
  const samples: { title: string; location: string }[] = [];

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
        });
      }
    } catch {
      rejected += 1;
    }
  }

  const lines = [
    `Source: ${args.sourceName}`,
    `Board: ${args.boardToken}`,
    `Fetched: ${args.jobs.length}`,
    `Accepted: ${accepted}`,
    `Rejected: ${rejected}`,
    `Snapshot: ${args.snapshotComplete ? 'complete' : 'incomplete'}`,
  ];
  if (samples.length > 0) {
    lines.push('Sample:');
    for (const sample of samples) {
      lines.push(`  ${sample.title}`);
      lines.push(`  ${sample.location}`);
    }
  }
  return lines.join('\n');
}

async function dryRunTokenOnly(boardToken: string): Promise<void> {
  const adapter = new GreenhouseAdapter({ boardToken, fetchBoard: true });
  const result = await adapter.fetchJobs({
    sourceId: '00000000-0000-4000-8000-000000000001',
    sourceName: boardToken,
    externalIdentifier: boardToken,
    companyName: boardToken,
  });
  console.log(
    formatDryRunReport({
      sourceName: boardToken,
      boardToken,
      jobs: result.jobs,
      snapshotComplete: result.snapshotComplete,
    }),
  );
}

async function runDryRun(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const token = source.externalIdentifier;
  if (!token) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (board token)`);
  }
  const company = source.companyId ? await store.findCompanyById(source.companyId) : null;
  const adapter = new GreenhouseAdapter({ boardToken: token, fetchBoard: true });
  const result = await adapter.fetchJobs({
    sourceId: source.id,
    sourceName: source.name,
    externalIdentifier: token,
    companyId: source.companyId,
    companyName: company?.name ?? source.name,
    companyDomain: company?.domain ?? null,
    metadata: source.metadata,
  });
  console.log(
    formatDryRunReport({
      sourceName: company?.name ?? source.name,
      boardToken: token,
      jobs: result.jobs,
      snapshotComplete: result.snapshotComplete,
    }),
  );
}

async function runLive(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const token = source.externalIdentifier;
  if (!token) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (board token)`);
  }
  const started = Date.now();
  const adapter = new GreenhouseAdapter({ boardToken: token });
  try {
    const result = await syncJobSource(store, source.id, adapter);
    logJobEngine('greenhouse_source_sync_completed', {
      sourceId: source.id,
      boardToken: token,
      fetched: result.metrics.fetched,
      accepted: result.metrics.accepted,
      rejected: result.metrics.rejected,
      durationMs: Date.now() - started,
    });
    console.log(`Source: ${source.name}`);
    console.log(`Board: ${token}`);
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
    logJobEngine('greenhouse_source_sync_failed', {
      sourceId: source.id,
      boardToken: token,
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
        : await store.findJobSourceByExternalIdentifier('greenhouse', options.source);
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
    throw new PersistenceError('No enabled Greenhouse sources found. Apply migration 0006 first.');
  }

  for (const source of sources) {
    if (options.dryRun) {
      await runDryRun(store, source);
    } else {
      await runLive(store, source);
    }
  }
}
