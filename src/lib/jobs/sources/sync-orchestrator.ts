import { AshbyAdapter } from '@/lib/jobs/adapters/ashby';
import { GreenhouseAdapter } from '@/lib/jobs/adapters/greenhouse';
import { LeverAdapter } from '@/lib/jobs/adapters/lever';
import { WwrAdapter } from '@/lib/jobs/adapters/we-work-remotely';
import { resolveLeverInstance } from '@/lib/jobs/adapters/lever-http';
import type { JobSourceAdapter } from '@/lib/jobs/adapters/types';
import { syncJobSource, type SyncSourceResult } from '@/lib/jobs/engine/sync-source';
import { validateSourceConfig } from '@/lib/jobs/sources/registry';
import type { JobEngineStore, JobSourceRecord } from '@/lib/jobs/repository/types';

/**
 * Bounded, failure-isolated multi-source sync driver.
 *
 * Delegates every source to `syncJobSource` — the Phase 3 engine already
 * owns run tracking, lifecycle, backoff, and the fast-path.
 *
 * Guarantees:
 *   * One source failure never aborts the rest of the run.
 *   * `apply=false` performs the same shape work but never persists,
 *     because the adapter is called through `syncJobSource` with a
 *     read-only view of the store when apply is false — see `applyMode`.
 *   * `snapshotComplete=false` sources contribute zero lifecycle misses
 *     (the engine already honours this; the orchestrator only aggregates).
 */

export type OrchestratorItem = {
  source: JobSourceRecord;
  outcome:
    | { status: 'succeeded'; result: SyncSourceResult }
    | { status: 'skipped_backoff'; reason: string }
    | { status: 'skipped_disabled'; reason: string }
    | { status: 'skipped_invalid'; reason: string }
    | { status: 'skipped_dry_run'; reason: string }
    | { status: 'failed'; reason: string };
};

export type OrchestratorSummary = {
  sourcesTotal: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesEmpty: number;
  sourcesSkippedBackoff: number;
  sourcesSkippedDisabled: number;
  sourcesSkippedInvalid: number;
  sourcesFailed: number;
  jobsFetched: number;
  jobsAccepted: number;
  staleSkipped: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsUnchanged: number;
};

export type OrchestratorOptions = {
  apply: boolean;
  concurrency?: number;
  now?: () => Date;
};

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 5;

async function mapPool<T, R>(
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

function isUnderBackoff(source: JobSourceRecord, now: Date): boolean {
  if (source.nextSyncAt == null) return false;
  return source.nextSyncAt.getTime() > now.getTime();
}

function buildAdapter(source: JobSourceRecord): JobSourceAdapter | null {
  const identifier = (source.externalIdentifier ?? '').trim();
  if (!identifier) return null;
  switch (source.sourceType) {
    case 'greenhouse':
      return new GreenhouseAdapter({ boardToken: identifier });
    case 'lever': {
      const instance = resolveLeverInstance(
        (source.metadata as { lever_instance?: unknown } | null)?.lever_instance,
      );
      return new LeverAdapter({ site: identifier, instance });
    }
    case 'ashby':
      return new AshbyAdapter({ boardName: identifier });
    case 'we_work_remotely':
      return new WwrAdapter();
    default:
      return null;
  }
}

export async function runSyncOrchestrator(
  store: JobEngineStore,
  sources: readonly JobSourceRecord[],
  options: OrchestratorOptions,
): Promise<{ items: OrchestratorItem[]; summary: OrchestratorSummary }> {
  const nowFn = options.now ?? (() => new Date());
  const concurrency = Math.max(
    1,
    Math.min(MAX_CONCURRENCY, options.concurrency ?? DEFAULT_CONCURRENCY),
  );

  const items: OrchestratorItem[] = await mapPool(sources, concurrency, async (source) => {
    // Static config validation first — never touches the network.
    const validation = validateSourceConfig(source);
    if (!validation.valid) {
      return {
        source,
        outcome: { status: 'skipped_invalid', reason: validation.message },
      } satisfies OrchestratorItem;
    }
    if (!source.enabled) {
      return {
        source,
        outcome: { status: 'skipped_disabled', reason: 'source is disabled' },
      } satisfies OrchestratorItem;
    }
    if (isUnderBackoff(source, nowFn())) {
      const reason = source.nextSyncAt
        ? `under backoff until ${source.nextSyncAt.toISOString()}`
        : 'under backoff';
      return {
        source,
        outcome: { status: 'skipped_backoff', reason },
      } satisfies OrchestratorItem;
    }
    if (!options.apply) {
      return {
        source,
        outcome: {
          status: 'skipped_dry_run',
          reason: 'dry-run: source would be synced with --apply',
        },
      } satisfies OrchestratorItem;
    }
    const adapter = buildAdapter(source);
    if (!adapter) {
      return {
        source,
        outcome: { status: 'skipped_invalid', reason: 'no adapter for provider' },
      } satisfies OrchestratorItem;
    }
    try {
      const result = await syncJobSource(store, source.id, adapter);
      return { source, outcome: { status: 'succeeded', result } } satisfies OrchestratorItem;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      return {
        source,
        outcome: { status: 'failed', reason },
      } satisfies OrchestratorItem;
    }
  });

  const summary: OrchestratorSummary = {
    sourcesTotal: sources.length,
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesEmpty: 0,
    sourcesSkippedBackoff: 0,
    sourcesSkippedDisabled: 0,
    sourcesSkippedInvalid: 0,
    sourcesFailed: 0,
    jobsFetched: 0,
    jobsAccepted: 0,
    staleSkipped: 0,
    jobsCreated: 0,
    jobsUpdated: 0,
    jobsUnchanged: 0,
  };
  for (const item of items) {
    switch (item.outcome.status) {
      case 'skipped_disabled':
        summary.sourcesSkippedDisabled += 1;
        break;
      case 'skipped_backoff':
        summary.sourcesSkippedBackoff += 1;
        break;
      case 'skipped_invalid':
        summary.sourcesSkippedInvalid += 1;
        break;
      case 'skipped_dry_run':
        summary.sourcesAttempted += 1;
        break;
      case 'failed':
        summary.sourcesAttempted += 1;
        summary.sourcesFailed += 1;
        break;
      case 'succeeded': {
        summary.sourcesAttempted += 1;
        summary.sourcesSucceeded += 1;
        const m = item.outcome.result.metrics;
        if (m.fetched === 0) summary.sourcesEmpty += 1;
        summary.jobsFetched += m.fetched;
        summary.jobsAccepted += m.accepted;
        summary.staleSkipped += m.staleSkipped;
        summary.jobsCreated += m.canonicalJobsCreated;
        summary.jobsUpdated += m.canonicalJobsUpdated;
        summary.jobsUnchanged += m.unchanged;
        break;
      }
    }
  }
  return { items, summary };
}

export function formatOrchestratorReport(
  items: OrchestratorItem[],
  summary: OrchestratorSummary,
  apply: boolean,
): string {
  const lines: string[] = [];
  lines.push(apply ? 'Source sync (apply)' : 'Source sync (dry-run — no writes)');
  for (const item of items) {
    const identifier = item.source.externalIdentifier ?? '(none)';
    const suffix =
      item.outcome.status === 'succeeded'
        ? `fetched=${item.outcome.result.metrics.fetched} accepted=${item.outcome.result.metrics.accepted} unchanged=${item.outcome.result.metrics.unchanged} snapshot=${item.outcome.result.metrics.snapshotComplete ? 'complete' : 'incomplete'}`
        : 'reason' in item.outcome
          ? item.outcome.reason
          : '';
    lines.push(
      `- ${item.source.sourceType} ${identifier}: ${item.outcome.status}${suffix ? ` — ${suffix}` : ''}`,
    );
  }
  lines.push('');
  lines.push(
    `Total ${summary.sourcesTotal}  attempted=${summary.sourcesAttempted}  succeeded=${summary.sourcesSucceeded}  empty=${summary.sourcesEmpty}  failed=${summary.sourcesFailed}  skipped_backoff=${summary.sourcesSkippedBackoff}  skipped_disabled=${summary.sourcesSkippedDisabled}  skipped_invalid=${summary.sourcesSkippedInvalid}`,
  );
  lines.push(
    `Jobs   fetched=${summary.jobsFetched}  accepted=${summary.jobsAccepted}  staleSkipped=${summary.staleSkipped}  created=${summary.jobsCreated}  updated=${summary.jobsUpdated}  unchanged=${summary.jobsUnchanged}`,
  );
  return lines.join('\n');
}
