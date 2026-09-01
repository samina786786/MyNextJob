const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Relative age for jobs in the 30-day catalog. Uses a stable `asOf`
 * so SSR and hydration match. No live ticking clock.
 */
export function formatRelativeAge(at: Date, asOf: Date): string {
  const delta = asOf.getTime() - at.getTime();
  if (!Number.isFinite(delta) || delta < MINUTE_MS) return 'just now';
  if (delta < HOUR_MS) {
    const minutes = Math.floor(delta / MINUTE_MS);
    return `${minutes}m ago`;
  }
  if (delta < DAY_MS) {
    const hours = Math.floor(delta / HOUR_MS);
    return `${hours}h ago`;
  }
  const days = Math.floor(delta / DAY_MS);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export type FreshnessWording = {
  kind: 'posted' | 'found';
  prefix: 'Posted' | 'Found';
  relative: string;
  datetime: string;
  label: string;
};

/**
 * Posted = genuine published_at. Found = discovered_at fallback.
 * Never label discovered_at as Posted.
 */
export function freshnessWording(input: {
  publishedAt: string | Date | null;
  discoveredAt: string | Date;
  asOf: string | Date;
}): FreshnessWording {
  const asOf = input.asOf instanceof Date ? input.asOf : new Date(input.asOf);
  if (input.publishedAt) {
    const publishedAt =
      input.publishedAt instanceof Date ? input.publishedAt : new Date(input.publishedAt);
    const datetime = publishedAt.toISOString();
    const relative = formatRelativeAge(publishedAt, asOf);
    return {
      kind: 'posted',
      prefix: 'Posted',
      relative,
      datetime,
      label: `Posted ${relative}`,
    };
  }
  const discoveredAt =
    input.discoveredAt instanceof Date ? input.discoveredAt : new Date(input.discoveredAt);
  const datetime = discoveredAt.toISOString();
  const relative = formatRelativeAge(discoveredAt, asOf);
  return {
    kind: 'found',
    prefix: 'Found',
    relative,
    datetime,
    label: `Found ${relative}`,
  };
}
