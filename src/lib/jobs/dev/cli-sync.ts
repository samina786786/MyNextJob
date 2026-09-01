import 'server-only';

import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { PersistenceError } from '@/lib/jobs/errors';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import {
  SUPPORTED_PROVIDERS,
  isSupportedProvider,
  type SupportedProvider,
} from '@/lib/jobs/sources/registry';
import {
  formatOrchestratorReport,
  runSyncOrchestrator,
} from '@/lib/jobs/sources/sync-orchestrator';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';
import type { JobSourceRecord } from '@/lib/jobs/repository/types';

type CliOptions = {
  apply: boolean;
  provider?: SupportedProvider;
  source?: string;
  limit: number;
  concurrency?: number;
};

const DEFAULT_LIMIT = 60;

function usage(): string {
  return `Usage:
  pnpm jobs:sync                       (dry-run — no writes)
  pnpm jobs:sync --apply               (persist)
  pnpm jobs:sync --provider=greenhouse [--limit=<n>]
  pnpm jobs:sync --source=<uuid-or-identifier>
  pnpm jobs:sync --apply --concurrency=<1-5>

Multi-source ingestion. Dry-run is the default so an accidental invocation
never mutates production. --apply is REQUIRED for writes.

Every source is delegated to the Phase 3 engine (\`syncJobSource\`); one
source failure never aborts the rest of the run. Sources under backoff
(\`next_sync_at > now()\`) or with \`enabled=false\` are skipped and
reported. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, limit: DEFAULT_LIMIT };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (raw === '--apply') options.apply = true;
    else if (raw === '--dry-run') options.apply = false;
    else if (raw.startsWith('--provider=')) {
      const value = raw.slice('--provider='.length).trim();
      if (!isSupportedProvider(value)) {
        throw new Error(`Unknown provider "${value}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
      }
      options.provider = value;
    } else if (raw.startsWith('--source=')) {
      options.source = raw.slice('--source='.length).trim();
    } else if (raw.startsWith('--limit=')) {
      const parsed = Number(raw.slice('--limit='.length));
      if (Number.isFinite(parsed) && parsed >= 1) {
        options.limit = Math.min(500, Math.floor(parsed));
      }
    } else if (raw.startsWith('--concurrency=')) {
      const parsed = Number(raw.slice('--concurrency='.length));
      if (Number.isFinite(parsed) && parsed >= 1) {
        options.concurrency = Math.min(5, Math.max(1, Math.floor(parsed)));
      }
    }
  }
  return options;
}

function requireSecret(): void {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required for source sync.');
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);
  requireSecret();
  const store = new SupabaseJobStore(createAdminClient());
  const sources = await selectSources(store, options);
  const { items, summary } = await runSyncOrchestrator(store, sources, {
    apply: options.apply,
    concurrency: options.concurrency,
  });
  console.log(formatOrchestratorReport(items, summary, options.apply));
}
