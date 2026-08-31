import { AdapterFetchError } from '@/lib/jobs/errors';

export const ASHBY_API_ORIGIN = 'https://api.ashbyhq.com';
export const ASHBY_API_BASE = `${ASHBY_API_ORIGIN}/posting-api/job-board`;
export const ASHBY_CAREERS_ORIGIN = 'https://jobs.ashbyhq.com';

export const ASHBY_REQUEST_TIMEOUT_MS = 12_000;
export const ASHBY_MAX_ATTEMPTS = 3;
export const ASHBY_RETRY_AFTER_CAP_MS = 10_000;
export const ASHBY_MAX_JOBS = 2_000;
export const ASHBY_MAX_RESPONSE_BYTES = 5_000_000;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const NO_RETRY_STATUS = new Set([400, 401, 403, 404]);

export const ASHBY_USER_AGENT = 'MyNextJob/0.1 (Ashby job discovery)';

const BOARD_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function assertAshbyBoardName(boardName: string): string {
  const trimmed = boardName.trim();
  if (!BOARD_NAME_RE.test(trimmed)) {
    throw new AdapterFetchError('Invalid Ashby job board name');
  }
  return trimmed;
}

export function ashbyBoardUrl(boardName: string, includeCompensation = true): string {
  const token = assertAshbyBoardName(boardName);
  const url = new URL(`${ASHBY_API_BASE}/${token}`);
  if (includeCompensation) {
    url.searchParams.set('includeCompensation', 'true');
  }
  return url.toString();
}

export type AshbyFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, ASHBY_RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), ASHBY_RETRY_AFTER_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertJsonContentType(contentType: string | null): void {
  const value = contentType?.toLowerCase() ?? '';
  if (!value.includes('application/json') && !value.includes('+json')) {
    throw new AdapterFetchError('Ashby response was not JSON');
  }
}

async function readJson(response: Response): Promise<unknown> {
  assertJsonContentType(response.headers.get('content-type'));
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > ASHBY_MAX_RESPONSE_BYTES) {
    throw new AdapterFetchError('Ashby response exceeded the safety size limit');
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdapterFetchError('Ashby response could not be read');
  }
  if (text.length > ASHBY_MAX_RESPONSE_BYTES) {
    throw new AdapterFetchError('Ashby response exceeded the safety size limit');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdapterFetchError('Ashby response was not valid JSON');
  }
}

function statusErrorMessage(status: number, boardName: string): string {
  if (status === 404) {
    return `Ashby job board not found: ${boardName}`;
  }
  return `Ashby request failed (${status}) for board ${boardName}`;
}

function isTrustedAshbyUrl(url: string): boolean {
  return url.startsWith(`${ASHBY_API_ORIGIN}/`);
}

/**
 * Trusted-host GET. No Authorization, API keys, or cookies.
 * Retries only 429/5xx (and a single network / invalid-JSON failure).
 * Never retries 400/401/403/404.
 */
export async function fetchAshbyJson(
  url: string,
  boardName: string,
  options: AshbyFetchOptions = {},
): Promise<{ status: number; body: unknown }> {
  if (!isTrustedAshbyUrl(url)) {
    throw new AdapterFetchError('Ashby request host is not trusted');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? ASHBY_REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? ASHBY_MAX_ATTEMPTS;

  let lastNetworkError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'User-Agent': ASHBY_USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastNetworkError = error;
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      if (aborted || attempt === maxAttempts) {
        throw new AdapterFetchError(
          `Ashby request failed for board ${boardName}: ${
            error instanceof Error ? error.message : 'network error'
          }`,
        );
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), ASHBY_RETRY_AFTER_CAP_MS));
      continue;
    }

    if (response.ok) {
      try {
        return { status: response.status, body: await readJson(response) };
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await sleep(Math.min(500 * 2 ** (attempt - 1), ASHBY_RETRY_AFTER_CAP_MS));
        continue;
      }
    }

    if (NO_RETRY_STATUS.has(response.status) || !TRANSIENT_STATUS.has(response.status)) {
      throw new AdapterFetchError(statusErrorMessage(response.status, boardName));
    }

    if (attempt === maxAttempts) {
      throw new AdapterFetchError(statusErrorMessage(response.status, boardName));
    }

    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfter ?? Math.min(500 * 2 ** (attempt - 1), ASHBY_RETRY_AFTER_CAP_MS));
  }

  throw new AdapterFetchError(
    `Ashby request failed for board ${boardName}: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : 'network error'
    }`,
  );
}
