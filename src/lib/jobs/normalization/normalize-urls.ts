import { ValidationError } from '@/lib/jobs/errors';

const BLOCKED = /^(javascript|data|file|vbscript|blob):/i;

/**
 * HTTP/HTTPS only. No following redirects. Credentials are rejected.
 */
export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (BLOCKED.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (!url.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export function requireSafeHttpUrl(value: string, field: 'apply_url' | 'source_url'): string {
  const trimmed = value.trim();
  if (!isSafeHttpUrl(trimmed)) {
    throw new ValidationError(
      field === 'apply_url' ? 'invalid_apply_url' : 'invalid_source_url',
      `${field} must be an http(s) URL`,
    );
  }
  return trimmed;
}

export function resolveJobUrls(applyUrl: string, sourceUrl: string): {
  applyUrl: string | null;
  sourceUrl: string | null;
  canonicalUrl: string;
} {
  const apply = applyUrl.trim();
  const source = sourceUrl.trim();

  if (apply && !isSafeHttpUrl(apply)) {
    throw new ValidationError('invalid_apply_url', 'apply_url must be an http(s) URL');
  }
  if (source && !isSafeHttpUrl(source)) {
    throw new ValidationError('invalid_source_url', 'source_url must be an http(s) URL');
  }
  if (!apply && !source) {
    throw new ValidationError('missing_url', 'A job needs an apply URL or a source URL');
  }

  const applySafe = apply || null;
  const sourceSafe = source || null;
  return {
    applyUrl: applySafe,
    sourceUrl: sourceSafe,
    canonicalUrl: applySafe ?? sourceSafe!,
  };
}
