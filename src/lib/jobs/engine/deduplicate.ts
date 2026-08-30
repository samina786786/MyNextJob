import { comparisonKey } from '@/lib/jobs/normalization/text';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';
import type { CanonicalJobRecord } from '@/lib/jobs/repository/types';

const PUBLISH_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function descriptionsSubstantiallyIdentical(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a ? comparisonKey(a) : '';
  const right = b ? comparisonKey(b) : '';
  if (!left || !right) return false;
  return left === right;
}

export function publishWindowsCompatible(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  if (!a || !b) return true;
  const left = a instanceof Date ? a.getTime() : new Date(a).getTime();
  const right = b instanceof Date ? b.getTime() : new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return true;
  return Math.abs(left - right) <= PUBLISH_WINDOW_MS;
}

/**
 * Automatic merge only when evidence is strong:
 * same company, title, location, substantially identical description,
 * compatible publication window.
 *
 * Same title/company with a materially different description stays
 * two canonical jobs. Prefer a later duplicate over destroying a
 * legitimate second opening.
 */
export function isStrongDuplicate(candidate: CanonicalJobRecord, incoming: PreparedJob): boolean {
  const sameCompany =
    (candidate.companyId && incoming.companyId && candidate.companyId === incoming.companyId) ||
    (candidate.companyNameKey === incoming.companyNameKey &&
      (candidate.companyDomain == null ||
        incoming.companyDomain == null ||
        candidate.companyDomain === incoming.companyDomain));

  if (!sameCompany) return false;
  if (candidate.titleKey !== incoming.titleKey) return false;
  if (candidate.locationComparison !== incoming.locationComparison) return false;
  if (!descriptionsSubstantiallyIdentical(candidate.descriptionText, incoming.descriptionText)) {
    return false;
  }
  return publishWindowsCompatible(candidate.publishedAt, incoming.publishedAt);
}
