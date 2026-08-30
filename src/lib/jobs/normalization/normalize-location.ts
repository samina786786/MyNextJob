import { comparisonKey } from '@/lib/jobs/normalization/text';
import type { NormalizedJobLocation, RemoteType } from '@/lib/jobs/types';

export type NormalizedLocation = {
  text: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  comparison: string;
};

function cleanPart(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Keep the human-readable location_text. Comparison is conservative:
 * "Hyderabad, India" and "Hyderabad, Telangana, India" stay different.
 * Remote is represented via remote_type, not by rewriting location.
 */
export function normalizeLocation(location: NormalizedJobLocation): NormalizedLocation {
  const text = cleanPart(location.text);
  const country = cleanPart(location.country);
  const city = cleanPart(location.city);
  const region = cleanPart(location.region);
  const comparison = comparisonKey(text ?? [city, region, country].filter(Boolean).join(', '));
  return { text, country, city, region, comparison };
}

const REMOTE_RE = /\b(remote|work from home|wfh|work-from-home)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[-\s]?site|in[-\s]?office|office)\b/i;

/**
 * Infer remote type from an explicit adapter value first. Location text
 * is a fallback only when the adapter left remoteType as unknown.
 * Description text is never guessed here.
 */
export function inferRemoteType(
  explicit: RemoteType | undefined,
  locationText: string | null,
): RemoteType {
  if (explicit && explicit !== 'unknown') return explicit;
  if (!locationText) return explicit ?? 'unknown';
  if (REMOTE_RE.test(locationText)) return 'remote';
  if (HYBRID_RE.test(locationText)) return 'hybrid';
  if (ONSITE_RE.test(locationText)) return 'onsite';
  return explicit ?? 'unknown';
}
