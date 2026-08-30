import { isStrongDuplicate } from '@/lib/jobs/engine/deduplicate';
import { jobContentHash, jobFingerprint } from '@/lib/jobs/engine/fingerprint';
import { jobReappearancePatch, reappearancePatch } from '@/lib/jobs/engine/lifecycle';
import { resolveCompany } from '@/lib/jobs/engine/resolve-company';
import { logJobEngine } from '@/lib/jobs/logging';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';
import type {
  CanonicalJobRecord,
  JobEngineStore,
  SourcePostingRecord,
} from '@/lib/jobs/repository/types';
import { toDbEmploymentType, toDbRemoteType, toDbSalaryPeriod } from '@/lib/jobs/repository/db-values';
import type { EmploymentType, RemoteType } from '@/lib/jobs/types';

export type PersistOutcomeKind = 'created' | 'updated' | 'unchanged' | 'merged';

export type PersistOutcome = {
  kind: PersistOutcomeKind;
  jobId: string;
  postingId: string;
  fingerprint: string;
  contentHash: string;
  duplicateCandidate: boolean;
};

function dbRemote(value: RemoteType): CanonicalJobRecord['remoteType'] {
  return toDbRemoteType(value);
}

function dbEmployment(value: EmploymentType): CanonicalJobRecord['employmentType'] {
  return toDbEmploymentType(value);
}

function jobSlug(title: string, id: string): string {
  const base = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'job'}-${id.slice(0, 8)}`;
}

function canonicalFields(job: PreparedJob, company: { id: string; nameKey: string; domain: string | null }) {
  return {
    companyId: company.id,
    companyNameKey: company.nameKey,
    companyDomain: company.domain,
    title: job.title,
    titleKey: job.titleKey,
    descriptionHtml: job.descriptionHtml,
    descriptionText: job.descriptionText,
    locationText: job.locationText,
    locationComparison: job.locationComparison,
    country: job.country,
    city: job.city,
    remoteType: dbRemote(job.remoteType),
    employmentType: dbEmployment(job.employmentType),
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: toDbSalaryPeriod(job.salaryPeriod),
    publishedAt: job.publishedAt,
    applyUrl: job.applyUrl,
    sourceUrl: job.sourceUrl,
  };
}

/**
 * Validate → resolve company → fingerprint → content hash →
 * source identity upsert → conservative canonical merge.
 *
 * Same (source_id, external_id) never creates a second posting.
 */
export async function persistNormalizedJob(
  store: JobEngineStore,
  input: unknown,
): Promise<PersistOutcome> {
  const prepared = prepareNormalizedJob(input);
  const company = await resolveCompany(store, prepared);
  prepared.companyId = company.id;
  const fingerprint = jobFingerprint(prepared);
  const contentHash = jobContentHash(prepared);
  const now = store.now();

  const existingPosting = await store.findSourcePosting(prepared.sourceId, prepared.externalId);
  if (existingPosting) {
    return refreshExistingPosting(store, {
      prepared,
      company,
      fingerprint,
      contentHash,
      posting: existingPosting,
      now,
    });
  }

  const candidates = await store.findCanonicalCandidates(fingerprint);
  const duplicateCandidate = candidates.length > 0;
  const strong = candidates.find((row) => isStrongDuplicate(row, prepared));

  if (strong) {
    logJobEngine('duplicate_candidate', {
      sourceId: prepared.sourceId,
      jobId: strong.id,
      merged: true,
    });
    return attachPostingToCanonical(store, {
      prepared,
      company,
      fingerprint,
      contentHash,
      job: strong,
      now,
      duplicateCandidate: true,
    });
  }

  if (duplicateCandidate) {
    logJobEngine('duplicate_candidate', {
      sourceId: prepared.sourceId,
      jobId: candidates[0]?.id,
      merged: false,
    });
  }

  return insertCanonicalAndPosting(store, {
    prepared,
    company,
    fingerprint,
    contentHash,
    now,
    duplicateCandidate,
  });
}

async function refreshExistingPosting(
  store: JobEngineStore,
  args: {
    prepared: PreparedJob;
    company: { id: string; nameKey: string; domain: string | null };
    fingerprint: string;
    contentHash: string;
    posting: SourcePostingRecord;
    now: Date;
  },
): Promise<PersistOutcome> {
  const { prepared, company, fingerprint, contentHash, posting, now } = args;
  const job = await store.findCanonicalJob(posting.jobId);
  if (!job) {
    return insertCanonicalAndPosting(store, {
      prepared,
      company,
      fingerprint,
      contentHash,
      now,
      duplicateCandidate: false,
    });
  }

  const unchanged = posting.contentHash === contentHash;
  await store.updateSourcePosting(posting.id, {
    ...reappearancePatch(now),
    sourceUrl: prepared.sourceUrl,
    applyUrl: prepared.applyUrl,
    publishedAt: prepared.publishedAt,
    contentHash,
    rawPayload: unchanged ? posting.rawPayload : prepared.rawPayload,
  });

  const reopen = jobReappearancePatch(job, now);

  if (unchanged) {
    await store.updateCanonicalJob(job.id, reopen);
    return {
      kind: 'unchanged',
      jobId: job.id,
      postingId: posting.id,
      fingerprint,
      contentHash,
      duplicateCandidate: false,
    };
  }

  await store.updateCanonicalJob(job.id, {
    ...canonicalFields(prepared, company),
    fingerprint,
    contentHash,
    ...reopen,
  });
  logJobEngine('job_updated', { sourceId: prepared.sourceId, jobId: job.id });
  return {
    kind: 'updated',
    jobId: job.id,
    postingId: posting.id,
    fingerprint,
    contentHash,
    duplicateCandidate: false,
  };
}

async function attachPostingToCanonical(
  store: JobEngineStore,
  args: {
    prepared: PreparedJob;
    company: { id: string; nameKey: string; domain: string | null };
    fingerprint: string;
    contentHash: string;
    job: CanonicalJobRecord;
    now: Date;
    duplicateCandidate: boolean;
  },
): Promise<PersistOutcome> {
  const { prepared, company, fingerprint, contentHash, job, now } = args;
  const posting = await store.insertSourcePosting({
    jobId: job.id,
    sourceId: prepared.sourceId,
    externalId: prepared.externalId,
    sourceUrl: prepared.sourceUrl,
    applyUrl: prepared.applyUrl,
    rawPayload: prepared.rawPayload,
    publishedAt: prepared.publishedAt,
    lastSeenAt: now,
    active: true,
    contentHash,
    consecutiveMisses: 0,
  });

  const contentChanged = job.contentHash !== contentHash;
  await store.updateCanonicalJob(job.id, {
    ...(contentChanged ? canonicalFields(prepared, company) : {}),
    fingerprint,
    contentHash,
    ...jobReappearancePatch(job, now),
  });

  return {
    kind: 'merged',
    jobId: job.id,
    postingId: posting.id,
    fingerprint,
    contentHash,
    duplicateCandidate: true,
  };
}

async function insertCanonicalAndPosting(
  store: JobEngineStore,
  args: {
    prepared: PreparedJob;
    company: { id: string; nameKey: string; domain: string | null };
    fingerprint: string;
    contentHash: string;
    now: Date;
    duplicateCandidate: boolean;
  },
): Promise<PersistOutcome> {
  const { prepared, company, fingerprint, contentHash, now, duplicateCandidate } = args;
  const id = crypto.randomUUID();
  const job = await store.insertCanonicalJob({
    id,
    sourceId: prepared.sourceId,
    externalId: prepared.externalId,
    slug: jobSlug(prepared.title, id),
    fingerprint,
    contentHash,
    consecutiveMisses: 0,
    closedAt: null,
    statusChangedAt: now,
    discoveredAt: now,
    lastSeenAt: now,
    status: 'open',
    ...canonicalFields(prepared, company),
  });

  const posting = await store.insertSourcePosting({
    jobId: job.id,
    sourceId: prepared.sourceId,
    externalId: prepared.externalId,
    sourceUrl: prepared.sourceUrl,
    applyUrl: prepared.applyUrl,
    rawPayload: prepared.rawPayload,
    publishedAt: prepared.publishedAt,
    lastSeenAt: now,
    active: true,
    contentHash,
    consecutiveMisses: 0,
  });

  logJobEngine('job_created', { sourceId: prepared.sourceId, jobId: job.id });
  return {
    kind: 'created',
    jobId: job.id,
    postingId: posting.id,
    fingerprint,
    contentHash,
    duplicateCandidate,
  };
}
