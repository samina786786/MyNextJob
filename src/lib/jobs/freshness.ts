/**
 * Product freshness: MyNextJob is not a historical job archive.
 * Active catalog window is 30 days from a trustworthy publication time,
 * or from discovered_at when publication time is unavailable.
 */

export const ACTIVE_CATALOG_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const FRESH_BAND_MS = 14 * 24 * 60 * 60 * 1000;
/** Clock-skew allowance. Beyond this, publishedAt is untrusted. */
export const FUTURE_PUBLISH_SKEW_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_FEED_PAGE_SIZE = 15;
export const MAX_FEED_PAGE_SIZE = 30;

export type FreshnessAdmission =
  | { admit: true; publishedAt: Date | null; trustedPublishedAt: boolean }
  | { admit: false; reason: 'stale_published' };

export function freshnessAt(publishedAt: Date | null | undefined, discoveredAt: Date): Date {
  return publishedAt ?? discoveredAt;
}

export function catalogCutoff(now: Date): Date {
  return new Date(now.getTime() - ACTIVE_CATALOG_WINDOW_MS);
}

export function isFreshForCatalog(at: Date, now: Date): boolean {
  return at.getTime() >= catalogCutoff(now).getTime();
}

/**
 * Future timestamps beyond clock skew are untrusted: admit the job as if
 * publishedAt were missing so we do not rank it as "impossibly fresh"
 * and do not skip it as stale.
 */
export function trustedPublishedAt(value: Date | null | undefined, now: Date): Date | null {
  if (value == null) return null;
  const time = value.getTime();
  if (Number.isNaN(time)) return null;
  if (time > now.getTime() + FUTURE_PUBLISH_SKEW_MS) return null;
  return value;
}

export function admitIncomingJob(
  publishedAt: Date | null | undefined,
  now: Date,
): FreshnessAdmission {
  const trusted = trustedPublishedAt(publishedAt, now);
  if (trusted && trusted.getTime() < catalogCutoff(now).getTime()) {
    return { admit: false, reason: 'stale_published' };
  }
  return { admit: true, publishedAt: trusted, trustedPublishedAt: trusted != null };
}

/** Read publishedAt from raw adapter input without sanitizing the description. */
export function peekIncomingPublishedAt(input: unknown): Date | null | undefined {
  if (input == null || typeof input !== 'object') return undefined;
  const value = (input as { publishedAt?: unknown }).publishedAt;
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function peekIncomingExternalId(input: unknown): string | undefined {
  if (input == null || typeof input !== 'object') return undefined;
  const source = (input as { source?: { externalId?: unknown } }).source;
  return typeof source?.externalId === 'string' && source.externalId.length > 0
    ? source.externalId
    : undefined;
}
