import { NormalizationError } from '@/lib/jobs/errors';
import { comparisonKey } from '@/lib/jobs/normalization/text';

const BLOCKED_PROTOCOLS = /^(javascript|data|file|vbscript|blob):/i;

/**
 * Canonical hostname for company identity.
 * https://www.example.com/ → example.com
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (BLOCKED_PROTOCOLS.test(trimmed)) {
    throw new NormalizationError('Blocked URL protocol in company domain', 'invalid_domain');
  }

  let url: URL;
  try {
    url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
  } catch {
    throw new NormalizationError('Malformed company domain', 'invalid_domain');
  }

  if (url.username || url.password) {
    throw new NormalizationError('Credentials are not allowed in company domains', 'invalid_domain');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NormalizationError('Company domain must be http(s)', 'invalid_domain');
  }

  let host = url.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  if (!isSafeHostname(host)) {
    throw new NormalizationError('Malformed company hostname', 'invalid_domain');
  }
  return host;
}

export function isSafeHostname(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false;
  if (!host.includes('.')) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    host,
  );
}

export function domainComparisonKey(domain: string): string {
  return comparisonKey(domain);
}
