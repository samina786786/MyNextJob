import { FeedCursorError } from '@/lib/jobs/errors';
import { DEFAULT_FEED_PAGE_SIZE, MAX_FEED_PAGE_SIZE } from '@/lib/jobs/freshness';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FeedCursor = {
  freshnessAt: Date;
  id: string;
};

export function clampFeedLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_FEED_PAGE_SIZE;
  return Math.min(MAX_FEED_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  const payload = `${cursor.freshnessAt.toISOString()}|${cursor.id}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeFeedCursor(raw: string): FeedCursor {
  if (raw.length > 256) throw new FeedCursorError();
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new FeedCursorError();
  }
  const sep = decoded.lastIndexOf('|');
  if (sep < 1) throw new FeedCursorError();
  const iso = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  const freshnessAt = new Date(iso);
  if (Number.isNaN(freshnessAt.getTime()) || !UUID_RE.test(id)) {
    throw new FeedCursorError();
  }
  return { freshnessAt, id };
}
