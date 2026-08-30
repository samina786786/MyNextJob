import 'server-only';

import { LeverAdapter } from '@/lib/jobs/adapters/lever';
import type { LeverInstance } from '@/lib/jobs/adapters/lever-http';
import { resolveLeverInstance } from '@/lib/jobs/adapters/lever-http';
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
  pnpm jobs:lever --source=<uuid-or-site> [--dry-run]
  pnpm jobs:lever --all [--dry-run]

Dry run fetches, paginates, validates, normalizes, and fingerprints. It does not write to Supabase.
Live run uses SupabaseJobStore and the Phase 3 sync engine.`);
}

function createLiveStore(): SupabaseJobStore {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required for live ingestion.');
  }
  return new SupabaseJobStore(createAdminClient());
}

function instanceOf(source: JobSourceRecord): LeverInstance {
  return resolveLeverInstance(source.metadata.lever_instance);
}

async function resolveSources(store: SupabaseJobStore, options: CliOptions): Promise<JobSourceRecord[]> {
  if (options.all) {
    return store.listJobSources({ sourceType: 'lever', enabled: true });
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
  const bySite = await store.findJobSourceByExternalIdentifier('lever', options.source);
  if (!bySite) {
    throw new PersistenceError(
      `No Lever source with site "${options.source}". Apply 0007 or pass a source UUID.`,
    );
  }
  return [bySite];
}

export function formatLeverDryRunReport(args: {
  sourceName: string;
  site: string;
  instance: LeverInstance;
  pages: number;
  jobs: Awaited<ReturnType<LeverAdapter['fetchJobs']>>['jobs'];
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
    'Provider: Lever',
    `Instance: ${args.instance}`,
    `Site: ${args.site}`,
    `Pages: ${args.pages}`,
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

function pagesFrom(result: Awaited<ReturnType<LeverAdapter['fetchJobs']>>): number {
  return typeof result.metadata?.pages === 'number' ? result.metadata.pages : 0;
}

async function dryRunTokenOnly(site: string): Promise<void> {
  const adapter = new LeverAdapter({ site, instance: 'global' });
  const result = await adapter.fetchJobs({
    sourceId: '00000000-0000-4000-8000-000000000001',
    sourceName: site,
    externalIdentifier: site,
    companyName: site,
    metadata: { lever_instance: 'global' },
  });
  console.log(
    formatLeverDryRunReport({
      sourceName: site,
      site,
      instance: 'global',
      pages: pagesFrom(result),
      jobs: result.jobs,
      snapshotComplete: result.snapshotComplete,
    }),
  );
}

async function runDryRun(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const site = source.externalIdentifier;
  if (!site) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (Lever site)`);
  }
  const instance = instanceOf(source);
  const company = source.companyId ? await store.findCompanyById(source.companyId) : null;
  const adapter = new LeverAdapter({ site, instance });
  const result = await adapter.fetchJobs({
    sourceId: source.id,
    sourceName: source.name,
    externalIdentifier: site,
    companyId: source.companyId,
    companyName: company?.name ?? source.name,
    companyDomain: company?.domain ?? null,
    metadata: source.metadata,
  });
  console.log(
    formatLeverDryRunReport({
      sourceName: company?.name ?? source.name,
      site,
      instance,
      pages: pagesFrom(result),
      jobs: result.jobs,
      snapshotComplete: result.snapshotComplete,
    }),
  );
}

async function runLive(store: SupabaseJobStore, source: JobSourceRecord): Promise<void> {
  const site = source.externalIdentifier;
  if (!site) {
    throw new AdapterFetchError(`Source ${source.id} has no external_identifier (Lever site)`);
  }
  const instance = instanceOf(source);
  const started = Date.now();
  const adapter = new LeverAdapter({ site, instance });
  try {
    const result = await syncJobSource(store, source.id, adapter);
    logJobEngine('lever_source_sync_completed', {
      sourceId: source.id,
      site,
      instance,
      fetched: result.metrics.fetched,
      accepted: result.metrics.accepted,
      rejected: result.metrics.rejected,
      durationMs: Date.now() - started,
    });
    console.log(`Source: ${source.name}`);
    console.log('Provider: Lever');
    console.log(`Instance: ${instance}`);
    console.log(`Site: ${site}`);
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
    logJobEngine('lever_source_sync_failed', {
      sourceId: source.id,
      site,
      instance,
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
        : await store.findJobSourceByExternalIdentifier('lever', options.source);
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
    throw new PersistenceError('No enabled Lever sources found. Apply migration 0007 first.');
  }

  for (const source of sources) {
    if (options.dryRun) {
      await runDryRun(store, source);
    } else {
      await runLive(store, source);
    }
  }
}
