/**
 * Safe internal destinations for `?next=`. Anything that is not an
 * allow-listed same-origin path falls back to `/home`.
 */
const ALLOWED_PREFIXES = ['/home', '/profile', '/saved', '/activity', '/search'] as const;

export const DEFAULT_AUTH_REDIRECT = '/home';

export function sanitizeNext(raw: unknown, fallback = DEFAULT_AUTH_REDIRECT): string {
  if (typeof raw !== 'string') return fallback;

  let value = raw.trim();
  if (!value) return fallback;

  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('://')) return fallback;
  if (value.includes('\\')) return fallback;
  if (value.includes('\0')) return fallback;
  if (/^[a-zA-Z][a-zA-Z+.-]*:/.test(value)) return fallback;

  const path = value.split(/[?#]/, 1)[0] ?? value;
  const allowed = ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  return allowed ? path : fallback;
}
