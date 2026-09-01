import { describe, expect, it } from 'vitest';

import {
  UnsafeOutboundUrlError,
  assertPublicHttpsUrl,
  isBlockedIpAddress,
  parseHttpsAssetUrl,
  resolveAndPinHttps,
  resolveAssetUrl,
} from '@/lib/companies/assets/ssrf';
import { ASSET_FETCH_USER_AGENT } from '@/lib/companies/assets/ssrf';
import { fetchSafeHttps, type PinnedRequestFn } from '@/lib/companies/assets/fetch-safe';
import type { DnsLookupFn } from '@/lib/companies/assets/ssrf';

const publicLookup: DnsLookupFn = async () => [{ address: '1.1.1.1', family: 4 }];

function blocked(raw: string, lookup: DnsLookupFn = publicLookup) {
  return expect(assertPublicHttpsUrl(raw, lookup)).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
}

describe('SSRF URL parser', () => {
  it('accepts a public HTTPS host', async () => {
    const url = await assertPublicHttpsUrl('https://drivetrain.ai/apple-touch-icon.png', publicLookup);
    expect(url.hostname).toBe('drivetrain.ai');
  });

  it.each([
    ['http://example.com/icon.png', 'blocked scheme'],
    ['file:///etc/passwd', 'blocked scheme'],
    ['data:text/html,hi', 'blocked scheme'],
    ['javascript:alert(1)', 'blocked scheme'],
    ['ftp://example.com/icon.png', 'blocked scheme'],
    ['https://localhost/icon.png', 'blocked hostname'],
    ['https://127.0.0.1/icon.png', 'blocked literal IP'],
    ['https://0.0.0.0/icon.png', 'blocked literal IP'],
    ['https://10.0.0.8/icon.png', 'blocked literal IP'],
    ['https://172.16.4.1/icon.png', 'blocked literal IP'],
    ['https://192.168.1.9/icon.png', 'blocked literal IP'],
    ['https://169.254.169.254/latest/meta-data', 'blocked literal IP'],
    ['https://[::1]/icon.png', 'blocked literal IP'],
    ['https://[fc00::1]/icon.png', 'blocked literal IP'],
    ['https://[fe80::1]/icon.png', 'blocked literal IP'],
    ['https://[::ffff:127.0.0.1]/icon.png', 'blocked literal IP'],
    ['https://[::ffff:10.0.0.1]/icon.png', 'blocked literal IP'],
    ['https://metadata.google.internal/', 'blocked hostname'],
    ['https://metadata/', 'blocked hostname'],
  ])('rejects %s', async (raw) => {
    await blocked(raw);
  });

  it('rejects DNS that resolves to a private address', async () => {
    await blocked('https://evil.example/', async () => [{ address: '127.0.0.1', family: 4 }]);
    await blocked('https://evil.example/', async () => [{ address: '10.1.2.3', family: 4 }]);
    await blocked('https://evil.example/', async () => [{ address: '::1', family: 6 }]);
  });

  it('flags blocked IPv4 and IPv6 ranges', () => {
    expect(isBlockedIpAddress('10.0.0.0')).toBe(true);
    expect(isBlockedIpAddress('172.31.255.255')).toBe(true);
    expect(isBlockedIpAddress('192.168.0.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.0.1')).toBe(true);
    expect(isBlockedIpAddress('1.1.1.1')).toBe(false);
    expect(isBlockedIpAddress('::ffff:192.168.0.1')).toBe(true);
  });

  it('resolves relative icon hrefs against the page origin', () => {
    const page = new URL('https://example.com/careers');
    expect(resolveAssetUrl('/favicon.ico', page).toString()).toBe('https://example.com/favicon.ico');
    expect(resolveAssetUrl('//cdn.example.com/icon.png', page).toString()).toBe(
      'https://cdn.example.com/icon.png',
    );
    expect(() => resolveAssetUrl('javascript:alert(1)', page)).toThrow(UnsafeOutboundUrlError);
    expect(() => parseHttpsAssetUrl('http://example.com/x')).toThrow(UnsafeOutboundUrlError);
  });
});

describe('SSRF-hardened fetch', () => {
  it('rejects a redirect from a public URL to a private address', async () => {
    await expect(
      fetchSafeHttps('https://example.com/icon', {
        maxBytes: 1024,
        lookup: publicLookup,
        fetchImpl: async () =>
          new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/secret' } }),
      }),
    ).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
  });

  it('rejects a redirect loop', async () => {
    await expect(
      fetchSafeHttps('https://example.com/icon', {
        maxBytes: 1024,
        lookup: publicLookup,
        fetchImpl: async () =>
          new Response(null, { status: 302, headers: { Location: 'https://example.com/icon' } }),
      }),
    ).rejects.toMatchObject({ message: 'redirect loop' });
  });

  it('rejects too many redirects', async () => {
    let hop = 0;
    await expect(
      fetchSafeHttps('https://example.com/start', {
        maxBytes: 1024,
        lookup: publicLookup,
        fetchImpl: async () => {
          hop += 1;
          return new Response(null, {
            status: 302,
            headers: { Location: `https://example.com/hop-${hop}` },
          });
        },
      }),
    ).rejects.toMatchObject({ message: 'too many redirects' });
  });

  it('bounds the response body and uses a simple User-Agent without credentials', async () => {
    const seen: { headers: Headers; url: string }[] = [];
    await expect(
      fetchSafeHttps('https://example.com/big', {
        maxBytes: 8,
        lookup: publicLookup,
        fetchImpl: async (input, init) => {
          seen.push({ headers: new Headers(init?.headers), url: String(input) });
          return new Response('0123456789', { status: 200, headers: { 'content-type': 'text/plain' } });
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeOutboundUrlError);

    expect(seen[0]?.headers.get('user-agent')).toBe(ASSET_FETCH_USER_AGENT);
    expect(seen[0]?.headers.get('cookie')).toBeNull();
    expect(seen[0]?.headers.get('authorization')).toBeNull();
  });

  it('times out a hung request', async () => {
    await expect(
      fetchSafeHttps('https://example.com/slow', {
        maxBytes: 1024,
        timeoutMs: 30,
        lookup: publicLookup,
        fetchImpl: (_input, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      }),
    ).rejects.toMatchObject({ message: 'request timed out' });
  });
});

describe('DNS rebinding / TOCTOU protection', () => {
  it('pins the connection to the address returned by the pre-validated DNS lookup', async () => {
    const observed: { hostname: string; pinned: string; family: 4 | 6 }[] = [];
    let calls = 0;
    const publicThenPrivate: DnsLookupFn = async () => {
      calls += 1;
      return calls === 1
        ? [{ address: '1.1.1.1', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }];
    };

    const pinnedRequest: PinnedRequestFn = async (url, pinned) => {
      observed.push({ hostname: url.hostname, pinned: pinned.address, family: pinned.family });
      return { status: 200, headers: new Headers({ 'content-type': 'text/plain' }), body: null };
    };

    const result = await fetchSafeHttps('https://evil.example/x', {
      maxBytes: 1024,
      lookup: publicThenPrivate,
      pinnedRequest,
    });

    expect(result.status).toBe(200);
    // Exactly one DNS lookup drove the connection decision.
    expect(calls).toBe(1);
    expect(observed).toHaveLength(1);
    expect(observed[0]?.hostname).toBe('evil.example');
    // The connection target is the pre-validated public address, not the private one.
    expect(observed[0]?.pinned).toBe('1.1.1.1');
  });

  it('fails closed when a DNS lookup returns any private address', async () => {
    const rebinderLookup: DnsLookupFn = async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];
    await expect(
      fetchSafeHttps('https://evil.example/x', {
        maxBytes: 1024,
        lookup: rebinderLookup,
        pinnedRequest: async () => ({
          status: 200,
          headers: new Headers(),
          body: null,
        }),
      }),
    ).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
  });

  it('re-resolves and re-pins every redirect target before connecting', async () => {
    const observed: { url: string; pinned: string }[] = [];
    let calls = 0;
    const lookup: DnsLookupFn = async (hostname) => {
      calls += 1;
      if (hostname === 'first.example') return [{ address: '1.1.1.1', family: 4 }];
      if (hostname === 'second.example') return [{ address: '8.8.8.8', family: 4 }];
      return [{ address: '127.0.0.1', family: 4 }];
    };

    const pinnedRequest: PinnedRequestFn = async (url, pinned) => {
      observed.push({ url: url.toString(), pinned: pinned.address });
      if (url.hostname === 'first.example') {
        return {
          status: 302,
          headers: new Headers({ location: 'https://second.example/target' }),
          body: null,
        };
      }
      return { status: 200, headers: new Headers({ 'content-type': 'text/plain' }), body: null };
    };

    const result = await fetchSafeHttps('https://first.example/start', {
      maxBytes: 1024,
      lookup,
      pinnedRequest,
    });

    expect(result.finalUrl).toBe('https://second.example/target');
    expect(observed).toEqual([
      { url: 'https://first.example/start', pinned: '1.1.1.1' },
      { url: 'https://second.example/target', pinned: '8.8.8.8' },
    ]);
    expect(calls).toBe(2);
  });

  it('resolveAndPinHttps refuses when any resolved address is private', async () => {
    await expect(
      resolveAndPinHttps('https://mixed.example/', async () => [
        { address: '1.1.1.1', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
  });

  it('resolveAndPinHttps returns the first public address as the pinning target', async () => {
    const target = await resolveAndPinHttps('https://ok.example/', async () => [
      { address: '9.9.9.9', family: 4 },
      { address: '8.8.4.4', family: 4 },
    ]);
    expect(target.pinned).toEqual({ address: '9.9.9.9', family: 4 });
  });
});
