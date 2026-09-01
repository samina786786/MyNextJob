import 'server-only';

import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { PersistenceError } from '@/lib/jobs/errors';
import { SupabaseJobStore } from '@/lib/jobs/repository/supabase';
import {
  buildCoverageReport,
  buildRegistryAudit,
  formatAuditReport,
  formatCoverageReport,
} from '@/lib/jobs/sources/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';

type CliOptions = {
  coverage: boolean;
};

function usage(): string {
  return `Usage:
  pnpm jobs:sources:audit              (source registry health)
  pnpm jobs:sources:audit --coverage   (also print catalog coverage)

READ-ONLY. Never writes to the database. Reuses source_sync_runs for
health signals via the existing job_sources fields.`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { coverage: false };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (raw === '--coverage') options.coverage = true;
  }
  return options;
}

function requireSecret(): void {
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('Server Supabase secret is required for the registry audit.');
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseArgs(argv);
  requireSecret();
  const client = createAdminClient();
  const store = new SupabaseJobStore(client);
  const sources = await store.listJobSources({});
  const audit = await buildRegistryAudit(client, sources);
  console.log(formatAuditReport(audit));
  if (options.coverage) {
    const coverage = await buildCoverageReport(client);
    console.log('');
    console.log(formatCoverageReport(coverage));
  }
}
