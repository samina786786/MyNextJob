import { DEFAULT_SYNC_INTERVAL_MINUTES } from '@/lib/jobs/types';

export const BACKOFF_BASE_MINUTES = 15;
export const BACKOFF_MAX_MINUTES = 24 * 60;

/**
 * Deterministic next-sync delay. Does not schedule cron or enqueue work.
 *
 * success → source interval
 * first failure → base delay
 * repeated failures → exponential, capped
 */
export function nextSyncDelayMinutes(args: {
  succeeded: boolean;
  errorCount: number;
  intervalMinutes?: number;
}): number {
  if (args.succeeded) {
    return Math.max(1, args.intervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES);
  }
  const failures = Math.max(1, args.errorCount);
  const delay = BACKOFF_BASE_MINUTES * 2 ** (failures - 1);
  return Math.min(BACKOFF_MAX_MINUTES, delay);
}

export function nextSyncAt(from: Date, delayMinutes: number): Date {
  return new Date(from.getTime() + delayMinutes * 60_000);
}
