import { AdapterFetchError } from '@/lib/jobs/errors';

export type LeverInstance = 'global' | 'eu';

export const LEVER_API_ORIGINS = {
  global: 'https://api.lever.co',
  eu: 'https://api.eu.lever.co',
} as const;

export const LEVER_CAREERS_ORIGINS = {
  global: 'https://jobs.lever.co',
  eu: 'https://jobs.eu.lever.co',
} as const;

export const LEVER_REQUEST_TIMEOUT_MS = 12_000;
export const LEVER_MAX_ATTEMPTS = 3;
export const LEVER_RETRY_AFTER_CAP_MS = 10_000;
export const LEVER_PAGE_SIZE = 100;
export const LEVER_MAX_PAGES = 20;
export const LEVER_MAX_JOBS = 2_000;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const NO_RETRY_STATUS = new Set([400, 401, 403, 404]);

export const LEVER_USER_AGENT = 'MyNextJob/0.1 (Lever job discovery)';

const SITE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function assertLeverSite(site: string): string {
  const trimmed = site.trim();
  if (!SITE_RE.test(trimmed)) {
    throw new AdapterFetchError('Invalid Lever site identifier');
  }
  return trimmed;
}

export function resolveLeverInstance(value: unknown): LeverInstance {
  if (value == null || value === '') return 'global';
  if (value === 'global' || value === 'eu') return value;
  throw new AdapterFetchError('Lever instance must be "global" or "eu"');
}

export function leverApiBase(instance: LeverInstance): string {
  return `${LEVER_API_ORIGINS[instance]}/v0/postings`;
}

export function leverPostingsUrl(
  instance: LeverInstance,
  site: string,
  skip: number,
  limit: number,
): string {
  const token = assertLeverSite(site);
  const params = new URLSearchParams({
    mode: 'json',
    skip: String(skip),
    limit: String(limit),
  });
  return `${leverApiBase(instance)}/${token}?${params.toString()}`;
}

export type LeverFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, LEVER_RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), LEVER_RETRY_AFTER_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertJsonContentType(contentType: string | null): void {
  const value = contentType?.toLowerCase() ?? '';
  if (!value.includes('application/json') && !value.includes('+json')) {
    throw new AdapterFetchError('Lever response was not JSON');
  }
}

async function readJson(response: Response): Promise<unknown> {
  assertJsonContentType(response.headers.get('content-type'));
  try {
    return await response.json();
  } catch {
    throw new AdapterFetchError('Lever response was not valid JSON');
  }
}

function statusErrorMessage(status: number, site: string): string {
  if (status === 404) {
    return `Lever site not found: ${site}`;
  }
  return `Lever request failed (${status}) for site ${site}`;
}

function isTrustedLeverUrl(url: string): boolean {
  return url.startsWith(`${LEVER_API_ORIGINS.global}/`) || url.startsWith(`${LEVER_API_ORIGINS.eu}/`);
}

/**
 * Trusted-host GET. No Authorization, API keys, or cookies.
 * Retries only 429/5xx (and a single network failure). Never retries 400/401/403/404.
 */
export async function fetchLeverJson(
  url: string,
  site: string,
  options: LeverFetchOptions = {},
): Promise<{ status: number; body: unknown }> {
  if (!isTrustedLeverUrl(url)) {
    throw new AdapterFetchError('Lever request host is not trusted');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? LEVER_REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? LEVER_MAX_ATTEMPTS;

  let lastNetworkError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'User-Agent': LEVER_USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastNetworkError = error;
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      if (aborted || attempt === maxAttempts) {
        throw new AdapterFetchError(
          `Lever request failed for site ${site}: ${
            error instanceof Error ? error.message : 'network error'
          }`,
        );
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), LEVER_RETRY_AFTER_CAP_MS));
      continue;
    }

    if (response.ok) {
      try {
        return { status: response.status, body: await readJson(response) };
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await sleep(Math.min(500 * 2 ** (attempt - 1), LEVER_RETRY_AFTER_CAP_MS));
        continue;
      }
    }

    if (NO_RETRY_STATUS.has(response.status) || !TRANSIENT_STATUS.has(response.status)) {
      throw new AdapterFetchError(statusErrorMessage(response.status, site));
    }

    if (attempt === maxAttempts) {
      throw new AdapterFetchError(statusErrorMessage(response.status, site));
    }

    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfter ?? Math.min(500 * 2 ** (attempt - 1), LEVER_RETRY_AFTER_CAP_MS));
  }

  throw new AdapterFetchError(
    `Lever request failed for site ${site}: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : 'network error'
    }`,
  );
}
