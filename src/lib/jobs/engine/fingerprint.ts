import { sha256Hex } from '@/lib/jobs/normalization/payload';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';

/**
 * Fingerprint = duplicate CANDIDATE, not database primary identity.
 *
 * Two legitimate openings can share company + title + location
 * (e.g. multiple Software Engineer requisitions at the same site).
 * Never put a unique constraint on fingerprint.
 *
 * Inputs (deterministic):
 *   canonical company identity (domain or name key)
 *   + normalized title
 *   + normalized location comparison string
 *   + normalized employment type
 *
 * Description is intentionally excluded so fingerprint groups role
 * identity; merge decisions use description similarity separately.
 */
export function jobFingerprint(job: PreparedJob): string {
  const companyKey = job.companyDomain ?? job.companyNameKey;
  return sha256Hex([
    companyKey,
    job.titleKey,
    job.locationComparison,
    job.employmentType,
  ]);
}

/**
 * Content hash of normalized source-relevant fields.
 * Timestamps such as fetched_at / last_seen_at / discovered_at must
 * not appear here — they would force no-op updates.
 */
export function jobContentHash(job: PreparedJob): string {
  return sha256Hex([
    job.titleKey,
    job.descriptionText ?? '',
    job.locationComparison,
    String(job.salaryMin ?? ''),
    String(job.salaryMax ?? ''),
    job.salaryCurrency ?? '',
    job.salaryPeriod ?? '',
    job.remoteType,
    job.employmentType,
  ]);
}
