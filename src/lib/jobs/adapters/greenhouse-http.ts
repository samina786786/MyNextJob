import { AdapterFetchError } from '@/lib/jobs/errors';

export const GREENHOUSE_API_ORIGIN = 'https://boards-api.greenhouse.io';
export const GREENHOUSE_API_BASE = `${GREENHOUSE_API_ORIGIN}/v1/boards`;

export const GREENHOUSE_REQUEST_TIMEOUT_MS = 12_000;
export const GREENHOUSE_MAX_ATTEMPTS = 3;
export const GREENHOUSE_RETRY_AFTER_CAP_MS = 10_000;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const NO_RETRY_STATUS = new Set([400, 401, 403, 404]);

export const GREENHOUSE_USER_AGENT = 'MyNextJob/0.1 (Greenhouse job discovery)';

const BOARD_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function assertGreenhouseBoardToken(token: string): string {
  const trimmed = token.trim();
  if (!BOARD_TOKEN_RE.test(trimmed)) {
    throw new AdapterFetchError('Invalid Greenhouse board token');
  }
  return trimmed;
}

export function greenhouseJobsUrl(boardToken: string): string {
  const token = assertGreenhouseBoardToken(boardToken);
  return `${GREENHOUSE_API_BASE}/${token}/jobs?content=true`;
}

export function greenhouseBoardUrl(boardToken: string): string {
  const token = assertGreenhouseBoardToken(boardToken);
  return `${GREENHOUSE_API_BASE}/${token}`;
}

export type GreenhouseFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, GREENHOUSE_RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), GREENHOUSE_RETRY_AFTER_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertJsonContentType(contentType: string | null): void {
  const value = contentType?.toLowerCase() ?? '';
  if (!value.includes('application/json') && !value.includes('+json')) {
    throw new AdapterFetchError('Greenhouse response was not JSON');
  }
}

async function readJson(response: Response): Promise<unknown> {
  assertJsonContentType(response.headers.get('content-type'));
  try {
    return await response.json();
  } catch {
    throw new AdapterFetchError('Greenhouse response was not valid JSON');
  }
}

function statusErrorMessage(status: number, boardToken: string): string {
  if (status === 404) {
    return `Greenhouse board not found: ${boardToken}`;
  }
  return `Greenhouse request failed (${status}) for board ${boardToken}`;
}

/**
 * Trusted-host GET. No Authorization, API keys, or cookies.
 * Retries only 429/5xx (and a single network failure). Never retries 400/401/403/404.
 */
export async function fetchGreenhouseJson(
  url: string,
  boardToken: string,
  options: GreenhouseFetchOptions = {},
): Promise<{ status: number; body: unknown }> {
  if (!url.startsWith(`${GREENHOUSE_API_ORIGIN}/`)) {
    throw new AdapterFetchError('Greenhouse request host is not trusted');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GREENHOUSE_REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? GREENHOUSE_MAX_ATTEMPTS;

  let lastNetworkError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'User-Agent': GREENHOUSE_USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastNetworkError = error;
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      if (aborted || attempt === maxAttempts) {
        throw new AdapterFetchError(
          `Greenhouse request failed for board ${boardToken}: ${
            error instanceof Error ? error.message : 'network error'
          }`,
        );
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), GREENHOUSE_RETRY_AFTER_CAP_MS));
      continue;
    }

    if (response.ok) {
      return { status: response.status, body: await readJson(response) };
    }

    if (NO_RETRY_STATUS.has(response.status) || !TRANSIENT_STATUS.has(response.status)) {
      throw new AdapterFetchError(statusErrorMessage(response.status, boardToken));
    }

    if (attempt === maxAttempts) {
      throw new AdapterFetchError(statusErrorMessage(response.status, boardToken));
    }

    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfter ?? Math.min(500 * 2 ** (attempt - 1), GREENHOUSE_RETRY_AFTER_CAP_MS));
  }

  throw new AdapterFetchError(
    `Greenhouse request failed for board ${boardToken}: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : 'network error'
    }`,
  );
}
