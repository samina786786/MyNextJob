import { AdapterFetchError } from '@/lib/jobs/errors';

export const WWR_ORIGIN = 'https://weworkremotely.com';
export const WWR_RSS_PATH = '/remote-jobs.rss';
export const WWR_RSS_URL = `${WWR_ORIGIN}${WWR_RSS_PATH}`;
export const WWR_SOURCE_IDENTIFIER = 'weworkremotely-all';

export const WWR_REQUEST_TIMEOUT_MS = 12_000;
export const WWR_MAX_ATTEMPTS = 3;
export const WWR_RETRY_AFTER_CAP_MS = 10_000;
export const WWR_MAX_JOBS = 2_000;
export const WWR_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const NO_RETRY_STATUS = new Set([400, 401, 403, 404]);

export const WWR_USER_AGENT = 'MyNextJob/0.1 (We Work Remotely RSS discovery)';

export type WwrFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, WWR_RETRY_AFTER_CAP_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), WWR_RETRY_AFTER_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertXmlContentType(contentType: string | null): void {
  const value = contentType?.toLowerCase() ?? '';
  if (
    !value.includes('xml') &&
    !value.includes('rss') &&
    !value.includes('text/plain') &&
    value !== ''
  ) {
    throw new AdapterFetchError('WWR response was not XML');
  }
}

function isTrustedWwrRssUrl(url: string): boolean {
  return url === WWR_RSS_URL || url === `${WWR_RSS_URL}/`;
}

function statusErrorMessage(status: number): string {
  if (status === 404) return 'WWR RSS feed not found';
  return `WWR RSS request failed (${status})`;
}

/**
 * Trusted-host GET of the official all-jobs RSS feed.
 * No Authorization, API keys, or cookies.
 */
export async function fetchWwrRss(
  options: WwrFetchOptions = {},
): Promise<{ status: number; body: string; bytes: number }> {
  const url = WWR_RSS_URL;
  if (!isTrustedWwrRssUrl(url)) {
    throw new AdapterFetchError('WWR request host is not trusted');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? WWR_REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? WWR_MAX_ATTEMPTS;

  let lastNetworkError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
          'User-Agent': WWR_USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastNetworkError = error;
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      if (aborted || attempt === maxAttempts) {
        throw new AdapterFetchError(
          `WWR RSS request failed: ${error instanceof Error ? error.message : 'network error'}`,
        );
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), WWR_RETRY_AFTER_CAP_MS));
      continue;
    }

    if (response.ok) {
      assertXmlContentType(response.headers.get('content-type'));
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > WWR_MAX_RESPONSE_BYTES) {
        throw new AdapterFetchError('WWR RSS exceeded the safety size limit');
      }
      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new AdapterFetchError('WWR RSS response could not be read');
      }
      if (text.length > WWR_MAX_RESPONSE_BYTES) {
        throw new AdapterFetchError('WWR RSS exceeded the safety size limit');
      }
      return { status: response.status, body: text, bytes: text.length };
    }

    if (NO_RETRY_STATUS.has(response.status) || !TRANSIENT_STATUS.has(response.status)) {
      throw new AdapterFetchError(statusErrorMessage(response.status));
    }
    if (attempt === maxAttempts) {
      throw new AdapterFetchError(statusErrorMessage(response.status));
    }
    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfter ?? Math.min(500 * 2 ** (attempt - 1), WWR_RETRY_AFTER_CAP_MS));
  }

  throw new AdapterFetchError(
    `WWR RSS request failed: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : 'network error'
    }`,
  );
}
