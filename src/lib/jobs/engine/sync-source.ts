import type { JobSourceAdapter } from '@/lib/jobs/adapters/types';
import { AdapterFetchError, PersistenceError, ValidationError, sanitizeErrorMessage } from '@/lib/jobs/errors';
import { nextSyncAt, nextSyncDelayMinutes } from '@/lib/jobs/engine/backoff';
import { applyMissingLifecycle } from '@/lib/jobs/engine/lifecycle';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { logJobEngine } from '@/lib/jobs/logging';
import type { JobEngineStore } from '@/lib/jobs/repository/types';
import { JOB_ENGINE_BATCH_SIZE } from '@/lib/jobs/types';
import type { RejectionReason } from '@/lib/jobs/types';

export type SyncMetrics = {
  fetched: number;
  accepted: number;
  rejected: number;
  canonicalJobsCreated: number;
  canonicalJobsUpdated: number;
  unchanged: number;
  sourcePostingsCreated: number;
  sourcePostingsUpdated: number;
  duplicateCandidates: number;
  failures: number;
  snapshotComplete: boolean;
};

export type SyncRejection = {
  reason: RejectionReason | 'unknown';
  externalId?: string;
};

export type SyncSourceResult = {
  runId: string;
  status: 'succeeded' | 'failed';
  metrics: SyncMetrics;
  rejections: SyncRejection[];
  errorMessage: string | null;
};

function emptyMetrics(snapshotComplete: boolean): SyncMetrics {
  return {
    fetched: 0,
    accepted: 0,
    rejected: 0,
    canonicalJobsCreated: 0,
    canonicalJobsUpdated: 0,
    unchanged: 0,
    sourcePostingsCreated: 0,
    sourcePostingsUpdated: 0,
    duplicateCandidates: 0,
    failures: 0,
    snapshotComplete,
  };
}

/**
 * Orchestrate one source sync. Adapters never write to the database.
 *
 * Job-level validation failures are counted as rejected and do not fail
 * the run. Adapter/source-level failures fail the run, increment
 * error_count, and must not mass-close jobs.
 */
export async function syncJobSource(
  store: JobEngineStore,
  sourceId: string,
  adapter: JobSourceAdapter,
): Promise<SyncSourceResult> {
  const source = await store.getJobSource(sourceId);
  if (!source) {
    throw new PersistenceError(`Unknown job source ${sourceId}`);
  }

  const run = await store.startSyncRun(sourceId);
  const started = Date.now();
  logJobEngine('job_sync_started', { sourceId, runId: run.id });

  try {
    const company = source.companyId ? await store.findCompanyById(source.companyId) : null;
    const fetchResult = await adapter.fetchJobs({
      sourceId,
      sourceName: source.name,
      externalIdentifier: source.externalIdentifier,
      companyId: source.companyId,
      companyName: company?.name ?? source.name,
      companyDomain: company?.domain ?? null,
      metadata: source.metadata,
    });

    const metrics = emptyMetrics(fetchResult.snapshotComplete);
    const rejections: SyncRejection[] = [];
    const seenExternalIds = new Set<string>();
    const jobs = fetchResult.jobs;
    metrics.fetched = jobs.length;

    for (let offset = 0; offset < jobs.length; offset += JOB_ENGINE_BATCH_SIZE) {
      const chunk = jobs.slice(offset, offset + JOB_ENGINE_BATCH_SIZE);
      for (const raw of chunk) {
        const externalId = raw.source?.externalId;
        try {
          const outcome = await persistNormalizedJob(store, {
            ...raw,
            source: {
              sourceId,
              externalId: raw.source?.externalId ?? '',
            },
          });
          seenExternalIds.add(raw.source.externalId);
          metrics.accepted += 1;
          if (outcome.duplicateCandidate) metrics.duplicateCandidates += 1;
          if (outcome.kind === 'created') {
            metrics.canonicalJobsCreated += 1;
            metrics.sourcePostingsCreated += 1;
          } else if (outcome.kind === 'merged') {
            metrics.sourcePostingsCreated += 1;
            metrics.canonicalJobsUpdated += 1;
          } else if (outcome.kind === 'updated') {
            metrics.canonicalJobsUpdated += 1;
            metrics.sourcePostingsUpdated += 1;
          } else {
            metrics.unchanged += 1;
            metrics.sourcePostingsUpdated += 1;
          }
        } catch (error) {
          metrics.rejected += 1;
          const reason =
            error instanceof ValidationError ? error.reason : 'unknown';
          rejections.push({ reason, externalId });
          logJobEngine('job_rejected', {
            sourceId,
            reason,
            externalId,
          });
          if (!(error instanceof ValidationError)) {
            metrics.failures += 1;
          }
        }
      }
    }

    if (fetchResult.snapshotComplete) {
      await applyMissingLifecycle(store, {
        sourceId,
        seenExternalIds,
        snapshotComplete: true,
        policy: store.lifecyclePolicyForSource(source),
      });
    }

    await store.finishSyncRun(run.id, {
      status: 'succeeded',
      jobsFetched: metrics.fetched,
      jobsCreated: metrics.canonicalJobsCreated,
      jobsUpdated: metrics.canonicalJobsUpdated,
      jobsRejected: metrics.rejected,
      errorMessage: null,
      metrics,
    });

    const now = store.now();
    const delay = nextSyncDelayMinutes({
      succeeded: true,
      errorCount: 0,
      intervalMinutes: source.syncFrequencyMinutes,
    });
    await store.updateJobSource(sourceId, {
      lastSyncedAt: now,
      nextSyncAt: nextSyncAt(now, delay),
      errorCount: 0,
      status: source.status === 'disabled' ? 'disabled' : 'active',
    });

    logJobEngine('job_sync_completed', {
      sourceId,
      runId: run.id,
      durationMs: Date.now() - started,
      fetched: metrics.fetched,
      accepted: metrics.accepted,
      rejected: metrics.rejected,
    });

    return {
      runId: run.id,
      status: 'succeeded',
      metrics,
      rejections,
      errorMessage: null,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof AdapterFetchError ? error : new AdapterFetchError(sanitizeErrorMessage(error)),
    );
    const metrics = emptyMetrics(false);
    await store.finishSyncRun(run.id, {
      status: 'failed',
      errorMessage: message,
      metrics,
    });

    const now = store.now();
    const nextCount = source.errorCount + 1;
    const delay = nextSyncDelayMinutes({
      succeeded: false,
      errorCount: nextCount,
      intervalMinutes: source.syncFrequencyMinutes,
    });
    await store.updateJobSource(sourceId, {
      errorCount: nextCount,
      status: source.status === 'disabled' ? 'disabled' : nextCount >= 3 ? 'error' : 'active',
      nextSyncAt: nextSyncAt(now, delay),
    });

    logJobEngine('job_sync_failed', {
      sourceId,
      runId: run.id,
      durationMs: Date.now() - started,
    });

    return {
      runId: run.id,
      status: 'failed',
      metrics,
      rejections: [],
      errorMessage: message,
    };
  }
}
