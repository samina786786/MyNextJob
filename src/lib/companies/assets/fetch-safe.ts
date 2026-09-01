import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';

import {
  ASSET_FETCH_TIMEOUT_MS,
  ASSET_FETCH_USER_AGENT,
  ASSET_MAX_REDIRECTS,
  UnsafeOutboundUrlError,
  defaultDnsLookup,
  resolveAndPinHttps,
  type DnsLookupFn,
  type PinnedTarget,
} from '@/lib/companies/assets/ssrf';

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
};

export type PinnedRequestInit = {
  headers: Record<string, string>;
  signal: AbortSignal;
};

export type PinnedResponse = {
  status: number;
  headers: Headers;
  body: AsyncIterable<Uint8Array> | null;
};

export type PinnedRequestFn = (
  url: URL,
  pinned: PinnedTarget,
  init: PinnedRequestInit,
) => Promise<PinnedResponse>;

export type SafeFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  lookup?: DnsLookupFn;
  pinnedRequest?: PinnedRequestFn;
  fetchImpl?: typeof fetch;
  accept?: string;
};

function headersFromIncoming(source: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else {
      headers.append(name, value);
    }
  }
  return headers;
}

export const defaultPinnedRequest: PinnedRequestFn = (url, pinned, init) => {
  return new Promise<PinnedResponse>((resolve, reject) => {
    const port = url.port ? Number(url.port) : 443;
    const req = httpsRequest(
      {
        host: pinned.address,
        port,
        family: pinned.family,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: {
          Host: url.host,
          ...init.headers,
        },
        signal: init.signal,
        lookup: (_hostname, _options, callback) => {
          callback(null, pinned.address, pinned.family);
        },
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: headersFromIncoming(res.headers),
          body: res,
        });
      },
    );
    req.on('error', (error) => {
      reject(error);
    });
    req.end();
  });
};

function fetchImplToPinned(fetchImpl: typeof fetch): PinnedRequestFn {
  return async (url, _pinned, init) => {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: init.signal,
      headers: init.headers,
    });
    const body = response.body as AsyncIterable<Uint8Array> | null;
    const headers = new Headers();
    response.headers.forEach((value, name) => headers.append(name, value));
    return { status: response.status, headers, body };
  };
}

function asAsyncIterable(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const anySource = source as unknown as {
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
  };
  if (typeof anySource[Symbol.asyncIterator] === 'function') return source;
  if (typeof anySource.getReader === 'function') {
    return Readable.fromWeb(source as unknown as Parameters<typeof Readable.fromWeb>[0]);
  }
  throw new UnsafeOutboundUrlError('response body is not iterable');
}

async function readBoundedBody(
  source: AsyncIterable<Uint8Array> | null,
  declaredLength: number | undefined,
  maxBytes: number,
): Promise<Buffer> {
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    throw new UnsafeOutboundUrlError(`response too large (${declaredLength} bytes)`);
  }
  if (!source) return Buffer.alloc(0);
  const iterable = asAsyncIterable(source);
  const iterator = iterable[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await iterator.next();
      if (done) break;
      const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += buf.byteLength;
      if (total > maxBytes) {
        throw new UnsafeOutboundUrlError(`response exceeded ${maxBytes} bytes`);
      }
      chunks.push(buf);
    }
  } finally {
    if (iterator.return) {
      try {
        await iterator.return();
      } catch {
        /* ignore */
      }
    }
  }
  return Buffer.concat(chunks);
}

function drainBody(source: AsyncIterable<Uint8Array> | null): void {
  if (!source) return;
  if (source instanceof Readable) {
    source.destroy();
    return;
  }
  const anyBody = source as { cancel?: () => Promise<void> | void };
  if (typeof anyBody.cancel === 'function') {
    try {
      void anyBody.cancel();
    } catch {
      /* ignore */
    }
  }
}

export async function fetchSafeHttps(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const lookup = options.lookup ?? defaultDnsLookup;
  const pinnedRequest =
    options.pinnedRequest ??
    (options.fetchImpl ? fetchImplToPinned(options.fetchImpl) : defaultPinnedRequest);
  const timeoutMs = options.timeoutMs ?? ASSET_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? ASSET_MAX_REDIRECTS;

  let target = await resolveAndPinHttps(rawUrl, lookup);
  const seen = new Set<string>();

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const key = target.url.toString();
    if (seen.has(key)) {
      throw new UnsafeOutboundUrlError('redirect loop');
    }
    seen.add(key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: PinnedResponse;
    try {
      response = await pinnedRequest(target.url, target.pinned, {
        headers: {
          Accept: options.accept ?? '*/*',
          'User-Agent': ASSET_FETCH_USER_AGENT,
        },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new UnsafeOutboundUrlError(aborted ? 'request timed out' : 'request failed');
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      drainBody(response.body);
      if (!location) throw new UnsafeOutboundUrlError('redirect missing Location');
      if (hop === maxRedirects) {
        throw new UnsafeOutboundUrlError('too many redirects');
      }
      target = await resolveAndPinHttps(new URL(location, target.url).toString(), lookup);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      drainBody(response.body);
      throw new UnsafeOutboundUrlError(`HTTP ${response.status}`);
    }

    const declaredRaw = response.headers.get('content-length');
    const declared =
      declaredRaw != null && Number.isFinite(Number(declaredRaw)) ? Number(declaredRaw) : undefined;
    const body = await readBoundedBody(response.body, declared, options.maxBytes);
    return {
      finalUrl: target.url.toString(),
      status: response.status,
      contentType: (response.headers.get('content-type') ?? '').toLowerCase(),
      body,
    };
  }

  throw new UnsafeOutboundUrlError('redirect loop');
}
