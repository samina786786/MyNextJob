import 'server-only';

import { loadEnvLocal } from '@/lib/jobs/dev/load-env-local';
import { PersistenceError } from '@/lib/jobs/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseSecretEnv } from '@/lib/supabase/env';
import {
  formatCompanyAssetReport,
  parseCompanyAssetsArgs,
  runCompanyAssetPipeline,
} from '@/lib/companies/assets/run';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvLocal();
  const options = parseCompanyAssetsArgs(argv);
  if (options.limit < 0) {
    console.log(`Usage:
  pnpm companies:assets --dry-run
  pnpm companies:assets --apply
  pnpm companies:assets --apply --company=<uuid> --force --retry-failed --limit=20

Dry-run is the default. It does not fetch homepages, upload files, or
update companies. --apply performs SSRF-hardened discovery.`);
    return;
  }
  if (!getSupabaseSecretEnv().isConfigured) {
    throw new PersistenceError('SUPABASE_SECRET_KEY is required for the company asset CLI.');
  }
  const results = await runCompanyAssetPipeline(createAdminClient(), options);
  console.log(formatCompanyAssetReport(results, options.apply));
}
