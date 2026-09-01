import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveCompanyAsset,
  type ResolveDeps,
  type ResolveOutcome,
} from '@/lib/companies/assets/resolve';
import {
  listCompaniesForAssetRun,
  updateCompanyAssetMetadata,
  type CompanyAssetRow,
} from '@/lib/companies/assets/store';

export type CompanyAssetsCliOptions = {
  apply: boolean;
  force: boolean;
  retryFailed: boolean;
  companyId?: string;
  limit: number;
  concurrency: number;
};

export type CompanyAssetRunResult = {
  companyId: string;
  name: string;
  domain: string | null;
  outcome: ResolveOutcome;
};

const DEFAULT_LIMIT = 50;
const DEFAULT_CONCURRENCY = 4;

export function parseCompanyAssetsArgs(argv: string[]): CompanyAssetsCliOptions {
  const options: CompanyAssetsCliOptions = {
    apply: false,
    force: false,
    retryFailed: false,
    limit: DEFAULT_LIMIT,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--force') options.force = true;
    else if (arg === '--retry-failed') options.retryFailed = true;
    else if (arg.startsWith('--company=')) options.companyId = arg.slice('--company='.length);
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT);
    else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Math.min(5, Math.max(1, Number(arg.slice('--concurrency='.length)) || DEFAULT_CONCURRENCY));
    } else if (arg === '--help' || arg === '-h') {
      options.limit = -1;
    }
  }
  return options;
}

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item);
    }
  }
  const width = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: width }, () => run()));
  return results;
}

async function persistOutcome(
  client: SupabaseClient,
  company: CompanyAssetRow,
  outcome: ResolveOutcome,
  apply: boolean,
  now: Date,
): Promise<void> {
  if (!apply) return;
  if (outcome.status === 'skipped') return;
  const checked = now.toISOString();
  if (outcome.status === 'ready') {
    await updateCompanyAssetMetadata(client, company.id, {
      logoStatus: 'ready',
      logoStoragePath: outcome.storagePath,
      logoUpdatedAt: checked,
      logoCheckedAt: checked,
    });
    return;
  }
  await updateCompanyAssetMetadata(client, company.id, {
    logoStatus: outcome.status,
    logoStoragePath: outcome.status === 'unresolved' ? null : undefined,
    logoCheckedAt: checked,
  });
}

export async function runCompanyAssetPipeline(
  client: SupabaseClient,
  options: CompanyAssetsCliOptions,
  hooks: {
    resolve?: typeof resolveCompanyAsset;
    list?: typeof listCompaniesForAssetRun;
    now?: () => Date;
    deps?: ResolveDeps;
  } = {},
): Promise<CompanyAssetRunResult[]> {
  const resolve = hooks.resolve ?? resolveCompanyAsset;
  const list = hooks.list ?? listCompaniesForAssetRun;
  const now = hooks.now ?? (() => new Date());
  const companies = await list(client, {
    companyId: options.companyId,
    limit: options.limit,
    includeFailed: options.retryFailed || options.force,
    includeReady: options.force,
    // Bulk selection excludes companies without a trusted domain — logos
    // cannot be discovered without one, and processing them just churns
    // the row into `unresolved`. `--company=<uuid>` is unaffected.
    requireTrustedDomain: !options.companyId,
  });

  return mapPool(companies, options.concurrency, async (company) => {
    const outcome = await resolve(client, company, {
      apply: options.apply,
      force: options.force,
      deps: hooks.deps,
    });
    await persistOutcome(client, company, outcome, options.apply, now());
    return { companyId: company.id, name: company.name, domain: company.domain, outcome };
  });
}

export function formatCompanyAssetReport(results: CompanyAssetRunResult[], apply: boolean): string {
  const counts = { ready: 0, unresolved: 0, failed: 0, skipped: 0 };
  for (const row of results) counts[row.outcome.status] += 1;
  const lines = [
    apply ? 'Company assets (apply)' : 'Company assets (dry-run — no writes)',
    `processed=${results.length} ready=${counts.ready} unresolved=${counts.unresolved} failed=${counts.failed} skipped=${counts.skipped}`,
  ];
  for (const row of results) {
    const extra =
      row.outcome.status === 'ready'
        ? `${row.outcome.storagePath} ${row.outcome.bytes}B`
        : row.outcome.reason;
    lines.push(`- ${row.name} (${row.domain ?? 'no-domain'}): ${row.outcome.status} ${extra}`);
  }
  return lines.join('\n');
}
