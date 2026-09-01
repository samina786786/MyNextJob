import { NextResponse } from 'next/server';

import { getAuthIdentity } from '@/lib/auth/session';
import { FeedCursorError } from '@/lib/jobs/errors';
import { collectForbiddenFeedFields } from '@/lib/jobs/feed/card';
import { loadSharedFeedPage } from '@/lib/jobs/feed/load';
import { parseFeedQuery } from '@/lib/jobs/feed/parse-query';

const PRIVATE_JSON = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_JSON });
}

export async function GET(request: Request) {
  const identity = await getAuthIdentity();
  if (!identity) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const parsed = parseFeedQuery(new URL(request.url).searchParams);
    const page = await loadSharedFeedPage(parsed);
    if (collectForbiddenFeedFields(page).length > 0) {
      return json({ error: 'Something went wrong' }, 500);
    }
    return json(page, 200);
  } catch (error) {
    if (error instanceof FeedCursorError) {
      return json({ error: 'Invalid feed request' }, 400);
    }
    return json({ error: 'Something went wrong' }, 500);
  }
}
