import 'server-only';

import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { PersistenceError } from '@/lib/jobs/errors';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import {
  SUPPORTED_PROVIDERS,
  findDuplicateSources,
  isSupportedProvider,
  validateSourceConfig,
  type SupportedProvider,
} from '@/lib/jobs/sources/registry';
import { verifyCandidate, verifyOne, type VerifyResult } from '@/lib/jobs/sources/verify';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';
import type { JobSourceRecord } from '@/lib/jobs/repository/types';

type CliOptions = {
  provider?: SupportedProvider;
  source?: string;
  identifier?: string;
  candidate: boolean;
  leverInstance?: 'global' | 'eu';
  limit: number;
};

const DEFAULT_LIMIT = 100;

function usage(): string {
  return `Usage:
  Stored-registry mode (probes existing job_sources rows — REQUIRES SUPABASE_SECRET_KEY):
    pnpm jobs:sources:verify [--provider=<name>] [--source=<uuid-or-identifier>] [--limit=<n>]

  Candidate mode (probes provider host directly — NO DB access at all):
    pnpm jobs:sources:verify --candidate --provider=<name> --identifier=<value>
    pnpm jobs:sources:verify --candidate --provider=lever --identifier=drivetrain --lever-instance=global

READ-ONLY. Never writes to the database or storage. In candidate mode
the CLI accepts a provider + identifier from operator input, constructs
a synthetic record that satisfies validateSourceConfig, and probes the
provider host using the same fixed-hostname adapter path that ingestion
uses. Providers: ${SUPPORTED_PROVIDERS.join(', ')} (WWR is a singleton
and does not accept candidate probing).`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { limit: DEFAULT_LIMIT, candidate: false };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (raw === '--candidate') {
      options.candidate = true;
    } else if (raw.startsWith('--provider=')) {
      const value = raw.slice('--provider='.length).trim();
      if (!isSupportedProvider(value)) {
        throw new Error(`Unknown provider "${value}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
      }
      options.provider = value;
    } else if (raw.startsWith('--source=')) {
      options.source = raw.slice('--source='.length).trim();
    } else if (raw.startsWith('--identifier=')) {
      options.identifier = raw.slice('--identifier='.length).trim();
    } else if (raw.startsWith('--lever-instance=')) {
      const value = raw.slice('--lever-instance='.length).trim();
      if (value !== 'global' && value !== 'eu') {
        throw new Error('--lever-instance must be "global" or "eu"');
      }
      options.leverInstance = value;
    } else if (raw.startsWith('--limit=')) {
      const parsed = Number(raw.slice('--limit='.length));
      if (Number.isFinite(parsed) && parsed >= 1) {
        options.limit = Math.min(500, Math.floor(parsed));
      }
    }
  }
  return options;
}

function requireSecret(): void {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required to read the source registry.');
  }
}

async function selectSources(
  store: SupabaseJobStore,
  options: CliOptions,
): Promise<JobSourceRecord[]> {
  const all = await store.listJobSources({});
  const filtered = all.filter((s) => {
    if (options.provider && s.sourceType !== options.provider) return false;
    if (options.source) {
      const needle = options.source.trim().toLowerCase();
      if (s.id.toLowerCase() === needle) return true;
      if ((s.externalIdentifier ?? '').trim().toLowerCase() === needle) return true;
      return false;
    }
    return true;
  });
  return filtered.slice(0, options.limit);
}

function formatCandidateReport(
  provider: SupportedProvider,
  identifier: string,
  outcome: Awaited<ReturnType<typeof verifyCandidate>>,
): string {
  const lines: string[] = [];
  lines.push('Candidate source verification (READ-ONLY — no writes, no DB access)');
  lines.push('');
  lines.push(`Provider:   ${provider}`);
  lines.push(`Identifier: ${identifier}`);
  const extra =
    outcome.status === 'verified' || outcome.status === 'empty'
      ? ` jobCount=${outcome.jobCount ?? '?'}`
      : 'reason' in outcome
        ? ` ${outcome.reason}`
        : '';
  lines.push(`Outcome:    ${outcome.status}${extra}`);
  return lines.join('\n');
}

function formatStoredReport(
  results: VerifyResult[],
  duplicates: ReturnType<typeof findDuplicateSources>,
): string {
  const counts: Record<string, number> = {};
  const lines: string[] = [];
  lines.push('Source registry verification (READ-ONLY — no writes)');
  lines.push('');
  if (duplicates.length > 0) {
    lines.push('Duplicate provider identifiers:');
    for (const dup of duplicates) {
      lines.push(`  ${dup.provider}::${dup.identifier} → ${dup.ids.join(', ')}`);
    }
    lines.push('');
  }
  for (const result of results) {
    counts[result.outcome.status] = (counts[result.outcome.status] ?? 0) + 1;
    const identifier = result.source.externalIdentifier ?? '(none)';
    const outcome = result.outcome;
    let extra = '';
    if (outcome.status === 'verified' || outcome.status === 'empty') {
      extra = ` jobCount=${outcome.jobCount ?? '?'}`;
    } else if ('reason' in outcome) {
      extra = ` ${outcome.reason}`;
    }
    lines.push(
      `- ${result.source.sourceType} ${identifier} [${result.source.enabled ? 'enabled' : 'disabled'}]: ${outcome.status}${extra}`,
    );
  }
  lines.push('');
  const summary = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  lines.push(`Total ${results.length}  ${summary}`);
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);

  // Candidate mode: never touches the DB. This is the seed-eligibility gate.
  if (options.candidate) {
    if (!options.provider) throw new Error('--candidate requires --provider=<name>');
    if (!options.identifier) throw new Error('--candidate requires --identifier=<value>');
    const outcome = await verifyCandidate({
      provider: options.provider,
      identifier: options.identifier,
      leverInstance: options.leverInstance,
    });
    console.log(formatCandidateReport(options.provider, options.identifier, outcome));
    process.exitCode = outcome.status === 'verified' || outcome.status === 'empty' ? 0 : 2;
    return;
  }

  // Stored-registry mode: probes rows already in job_sources.
  requireSecret();
  const store = new SupabaseJobStore(createAdminClient());
  const sources = await selectSources(store, options);
  const validated: JobSourceRecord[] = [];
  const invalid: VerifyResult[] = [];
  for (const source of sources) {
    const validation = validateSourceConfig(source);
    if (!validation.valid) {
      invalid.push({ source, outcome: { status: 'invalid', reason: validation.message } });
    } else {
      validated.push(source);
    }
  }
  const probed: VerifyResult[] = [];
  for (const source of validated) {
    const outcome = await verifyOne(source);
    probed.push({ source, outcome });
  }
  const duplicates = findDuplicateSources(sources);
  console.log(formatStoredReport([...invalid, ...probed], duplicates));
}
