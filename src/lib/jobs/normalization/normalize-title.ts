import { comparisonKey } from '@/lib/jobs/normalization/text';

/** Display title: trim + Unicode fold only. Do not rewrite the visible title. */
export function displayTitle(title: string): string {
  return title.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Comparison title for fingerprints. Case/whitespace differences collapse. */
export function normalizeTitle(title: string): string {
  return comparisonKey(title);
}
