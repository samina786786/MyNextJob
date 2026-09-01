import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const ASSET_FETCH_USER_AGENT = 'MyNextJob/5C-company-assets';
export const ASSET_MAX_REDIRECTS = 3;
export const ASSET_FETCH_TIMEOUT_MS = 6_000;
export const ASSET_MAX_HTML_BYTES = 400_000;
export const ASSET_MAX_IMAGE_BYTES = 800_000;

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type DnsLookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export class UnsafeOutboundUrlError extends Error {
  readonly code = 'unsafe_outbound_url';
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

const BLOCKED_HOST_EXACT = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
]);

export async function defaultDnsLookup(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((row) => ({
    address: row.address,
    family: row.family === 6 ? 6 : 4,
  }));
}

export function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6(ip: string): number[] {
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) {
    if (isBlockedIpv4(mapped[1])) {
      return [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1];
    }
  }
  let value = ip.toLowerCase();
  if (value.startsWith('::ffff:')) {
    const v4 = value.slice(7);
    if (isIP(v4) === 4) {
      const [oa = 0, ob = 0, oc = 0, od = 0] = v4.split('.').map(Number);
      value = `0:0:0:0:0:ffff:${((oa << 8) | ob).toString(16)}:${((oc << 8) | od).toString(16)}`;
    }
  }
  const [head, tail] = value.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - (headParts.filter(Boolean).length + tailParts.filter(Boolean).length);
  const zeros = missing > 0 ? Array.from({ length: missing }, () => '0') : [];
  const parts = [...headParts.filter(Boolean), ...zeros, ...tailParts.filter(Boolean)];
  while (parts.length < 8) parts.push('0');
  return parts.slice(0, 8).map((part) => Number.parseInt(part, 16) || 0);
}

export function isBlockedIpv6(ip: string): boolean {
  if (/^::ffff:/i.test(ip)) {
    const v4 = ip.replace(/^::ffff:/i, '');
    if (isIP(v4) === 4) return isBlockedIpv4(v4);
  }
  const parts = expandIpv6(ip) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (parts.every((part) => part === 0)) return true;
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0 && parts[6] === 0 && parts[7] === 1) {
    return true;
  }
  if ((parts[0] & 0xfe00) === 0xfc00) return true;
  if ((parts[0] & 0xffc0) === 0xfe80) return true;
  if ((parts[0] & 0xff00) === 0xff00) return true;
  if (parts[0] === 0x2001 && parts[1] === 0xdb8) return true;
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0xffff) {
    const mappedA = (parts[6] >> 8) & 0xff;
    const mappedB = parts[6] & 0xff;
    const mappedC = (parts[7] >> 8) & 0xff;
    const mappedD = parts[7] & 0xff;
    return isBlockedIpv4(`${mappedA}.${mappedB}.${mappedC}.${mappedD}`);
  }
  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export function assertSafeAssetHostname(hostname: string): void {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeOutboundUrlError('hostname is empty');
  if (BLOCKED_HOST_EXACT.has(host)) throw new UnsafeOutboundUrlError(`blocked hostname: ${host}`);
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeOutboundUrlError(`blocked hostname suffix: ${host}`);
  }
  const ipFamily = isIP(host);
  if (ipFamily === 4 || ipFamily === 6) {
    if (isBlockedIpAddress(host)) throw new UnsafeOutboundUrlError(`blocked literal IP: ${host}`);
    return;
  }
  if (!host.includes('.') || host.startsWith('.') || host.includes('..')) {
    throw new UnsafeOutboundUrlError(`malformed hostname: ${host}`);
  }
}

export function parseHttpsAssetUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new UnsafeOutboundUrlError('URL is empty');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UnsafeOutboundUrlError('malformed URL');
  }
  if (url.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError(`blocked scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError('credentials are not allowed');
  }
  if (url.port && url.port !== '443') {
    throw new UnsafeOutboundUrlError(`blocked port: ${url.port}`);
  }
  assertSafeAssetHostname(url.hostname);
  return url;
}

export type PinnedTarget = { address: string; family: 4 | 6 };
export type ResolvedTarget = { url: URL; pinned: PinnedTarget };

export async function resolveAndPinHttps(
  raw: string,
  lookup: DnsLookupFn = defaultDnsLookup,
): Promise<ResolvedTarget> {
  const url = parseHttpsAssetUrl(raw);
  const ipFamily = isIP(url.hostname);
  if (ipFamily === 4 || ipFamily === 6) {
    if (isBlockedIpAddress(url.hostname)) {
      throw new UnsafeOutboundUrlError(`blocked literal IP: ${url.hostname}`);
    }
    return { url, pinned: { address: url.hostname, family: ipFamily as 4 | 6 } };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new UnsafeOutboundUrlError(`DNS lookup failed for ${url.hostname}`);
  }
  if (addresses.length === 0) {
    throw new UnsafeOutboundUrlError(`DNS returned no addresses for ${url.hostname}`);
  }
  for (const row of addresses) {
    if (isBlockedIpAddress(row.address)) {
      throw new UnsafeOutboundUrlError(`DNS resolved to a blocked address (${row.address})`);
    }
  }
  const [first] = addresses;
  if (!first) {
    throw new UnsafeOutboundUrlError(`DNS returned no addresses for ${url.hostname}`);
  }
  return { url, pinned: { address: first.address, family: first.family } };
}

export async function assertPublicHttpsUrl(
  raw: string,
  lookup: DnsLookupFn = defaultDnsLookup,
): Promise<URL> {
  const { url } = await resolveAndPinHttps(raw, lookup);
  return url;
}

export function resolveAssetUrl(href: string, base: URL): URL {
  const trimmed = href.trim();
  if (!trimmed) throw new UnsafeOutboundUrlError('empty href');
  if (/^(javascript|data|file|ftp|blob|vbscript):/i.test(trimmed)) {
    throw new UnsafeOutboundUrlError('blocked href scheme');
  }
  const resolved = new URL(trimmed, base);
  return parseHttpsAssetUrl(resolved.toString());
}
