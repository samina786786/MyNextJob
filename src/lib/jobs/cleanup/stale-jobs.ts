import {
  freshnessAt,
  isFreshForCatalog,
} from '@/lib/jobs/freshness';
import type { CanonicalJobRecord, JobEngineStore, SourcePostingRecord } from '@/lib/jobs/repository/types';

export type StaleAgeBucket = '31-90d' | '91-365d' | '>365d';

export type StaleCleanupReport = {
  candidateStaleJobs: number;
  referencedPreserved: number;
  eligibleForDeletion: number;
  sourcePostingsAffected: number;
  ageBuckets: Record<StaleAgeBucket, number>;
  preservedBecauseFreshSibling: number;
  deleted: number;
};

export type CleanupCatalog = {
  now(): Date;
  listJobs(): CanonicalJobRecord[];
  listPostings(): SourcePostingRecord[];
  referencedJobIds(): Set<string>;
  deleteCanonicalJob(id: string): Promise<void>;
};

function bucket(ageMs: number): StaleAgeBucket {
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= 90 * day) return '31-90d';
  if (ageMs <= 365 * day) return '91-365d';
  return '>365d';
}

function jobHasFreshSibling(
  job: CanonicalJobRecord,
  postings: SourcePostingRecord[],
  now: Date,
): boolean {
  const siblings = postings.filter((posting) => posting.jobId === job.id);
  if (siblings.length < 2) return false;
  return siblings.some((posting) => {
    if (posting.publishedAt && isFreshForCatalog(posting.publishedAt, now)) return true;
    return false;
  });
}

/**
 * Stale retention cleanup. Never deletes user-referenced jobs.
 * A canonical job with another posting that still has a fresh published_at
 * is preserved. Companies are never deleted.
 */
export async function cleanupStaleJobs(
  catalog: CleanupCatalog,
  options: { apply: boolean },
): Promise<StaleCleanupReport> {
  const now = catalog.now();
  const referenced = catalog.referencedJobIds();
  const postings = catalog.listPostings();
  const ageBuckets: Record<StaleAgeBucket, number> = {
    '31-90d': 0,
    '91-365d': 0,
    '>365d': 0,
  };
  const eligibleIds: string[] = [];
  let referencedPreserved = 0;
  let preservedBecauseFreshSibling = 0;
  let sourcePostingsAffected = 0;

  for (const job of catalog.listJobs()) {
    const at = freshnessAt(job.publishedAt, job.discoveredAt);
    if (isFreshForCatalog(at, now)) continue;
    const age = now.getTime() - at.getTime();
    ageBuckets[bucket(age)] += 1;
    if (referenced.has(job.id)) {
      referencedPreserved += 1;
      continue;
    }
    if (jobHasFreshSibling(job, postings, now)) {
      preservedBecauseFreshSibling += 1;
      continue;
    }
    eligibleIds.push(job.id);
    sourcePostingsAffected += postings.filter((posting) => posting.jobId === job.id).length;
  }

  let deleted = 0;
  if (options.apply) {
    for (const id of eligibleIds) {
      await catalog.deleteCanonicalJob(id);
      deleted += 1;
    }
  }

  return {
    candidateStaleJobs:
      eligibleIds.length + referencedPreserved + preservedBecauseFreshSibling,
    referencedPreserved,
    eligibleForDeletion: eligibleIds.length,
    sourcePostingsAffected,
    ageBuckets,
    preservedBecauseFreshSibling,
    deleted,
  };
}

export function memoryCleanupCatalog(
  store: JobEngineStore & {
    listJobs(): CanonicalJobRecord[];
    listPostings(): SourcePostingRecord[];
  },
  referencedJobIds: Set<string> = new Set(),
): CleanupCatalog {
  return {
    now: () => store.now(),
    listJobs: () => store.listJobs(),
    listPostings: () => store.listPostings(),
    referencedJobIds: () => referencedJobIds,
    deleteCanonicalJob: (id) => store.deleteCanonicalJob(id),
  };
}

export function formatCleanupReport(report: StaleCleanupReport, apply: boolean): string {
  const mode = apply ? 'APPLY' : 'DRY-RUN';
  return [
    `Mode: ${mode}`,
    `Candidate stale jobs: ${report.candidateStaleJobs}`,
    `Referenced preserved: ${report.referencedPreserved}`,
    `Fresh-sibling preserved: ${report.preservedBecauseFreshSibling}`,
    `Eligible for deletion: ${report.eligibleForDeletion}`,
    `Source postings affected: ${report.sourcePostingsAffected}`,
    `Age 31-90d: ${report.ageBuckets['31-90d']}`,
    `Age 91-365d: ${report.ageBuckets['91-365d']}`,
    `Age >365d: ${report.ageBuckets['>365d']}`,
    `Deleted: ${report.deleted}`,
  ].join('\n');
}
