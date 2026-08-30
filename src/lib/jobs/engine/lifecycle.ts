import type { CanonicalJobRecord, JobEngineStore, SourcePostingRecord } from '@/lib/jobs/repository/types';
import type { JobStatus, LifecyclePolicy } from '@/lib/jobs/types';
import { DEFAULT_LIFECYCLE_POLICY } from '@/lib/jobs/types';

export type LifecycleResult = {
  postingUpdates: number;
  jobsPossiblyClosed: number;
  jobsClosed: number;
};

/**
 * Missing-job lifecycle.
 *
 * Seen this sync → posting active, misses reset, last_seen updated
 * (handled during persist, not here).
 *
 * Not seen on a COMPLETE snapshot:
 *   one miss → remain open/active
 *   misses >= possiblyClosed threshold → possibly_closed
 *   misses >= closed threshold → closed
 *
 * A PARTIAL snapshot must never call this with applyMisses=true.
 * Source fetch failures must never mass-close jobs.
 *
 * Misses are counted per source posting. A canonical job stays open
 * while any posting is still healthy.
 */
export async function applyMissingLifecycle(
  store: JobEngineStore,
  args: {
    sourceId: string;
    seenExternalIds: Set<string>;
    snapshotComplete: boolean;
    policy?: LifecyclePolicy;
  },
): Promise<LifecycleResult> {
  const result: LifecycleResult = {
    postingUpdates: 0,
    jobsPossiblyClosed: 0,
    jobsClosed: 0,
  };

  if (!args.snapshotComplete) return result;

  const policy = args.policy ?? DEFAULT_LIFECYCLE_POLICY;
  const now = store.now();
  const postings = await store.findPostingsBySource(args.sourceId);

  for (const posting of postings) {
    if (args.seenExternalIds.has(posting.externalId)) continue;

    const misses = posting.consecutiveMisses + 1;
    const stillListed = misses < policy.missesBeforeClosed;
    await store.updateSourcePosting(posting.id, {
      consecutiveMisses: misses,
      active: stillListed && posting.active,
      lastSeenAt: posting.lastSeenAt,
    });
    result.postingUpdates += 1;

    const job = await store.findCanonicalJob(posting.jobId);
    if (!job) continue;

    const allPostings = await store.findPostingsByJob(job.id);
    const nextStatus = deriveJobStatus(allPostings, job.id === posting.jobId ? {
      ...posting,
      consecutiveMisses: misses,
      active: stillListed && posting.active,
    } : null, policy);

    const consecutiveMisses = Math.max(
      ...allPostings.map((p) => (p.id === posting.id ? misses : p.consecutiveMisses)),
      0,
    );

    if (nextStatus !== job.status) {
      const closedAt =
        nextStatus === 'closed' ? now : nextStatus === 'open' ? null : job.closedAt;
      await store.updateCanonicalJob(job.id, {
        status: nextStatus,
        consecutiveMisses,
        statusChangedAt: now,
        closedAt,
      });
      if (nextStatus === 'possibly_closed') result.jobsPossiblyClosed += 1;
      if (nextStatus === 'closed') result.jobsClosed += 1;
    } else {
      await store.updateCanonicalJob(job.id, { consecutiveMisses });
    }
  }

  return result;
}

export function deriveJobStatus(
  postings: SourcePostingRecord[],
  replacement: SourcePostingRecord | null,
  policy: LifecyclePolicy,
): JobStatus {
  const rows = postings.map((p) => (replacement && p.id === replacement.id ? replacement : p));
  if (rows.length === 0) return 'open';

  const openish = rows.some((p) => p.consecutiveMisses < policy.missesBeforePossiblyClosed);
  if (openish) return 'open';

  const allClosed = rows.every((p) => p.consecutiveMisses >= policy.missesBeforeClosed);
  if (allClosed) return 'closed';

  return 'possibly_closed';
}

export function reappearancePatch(now: Date): Pick<
  SourcePostingRecord,
  'consecutiveMisses' | 'active' | 'lastSeenAt'
> {
  return {
    consecutiveMisses: 0,
    active: true,
    lastSeenAt: now,
  };
}

export function jobReappearancePatch(
  job: CanonicalJobRecord,
  now: Date,
): Partial<CanonicalJobRecord> {
  return {
    status: 'open',
    consecutiveMisses: 0,
    lastSeenAt: now,
    closedAt: null,
    statusChangedAt: job.status === 'open' ? job.statusChangedAt : now,
  };
}
