/**
 * Central place to read Supabase public env vars. Keeping this in one file
 * means the rest of the app can import a validated shape instead of touching
 * `process.env` directly.
 *
 * A missing env value is a soft-fail here (returns empty strings) because
 * the app must remain runnable before a real Supabase project is connected.
 * Auth actions return a friendly error when `isConfigured` is false.
 */
export function getSupabasePublicEnv(): {
  url: string;
  publishableKey: string;
  isConfigured: boolean;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  return {
    url,
    publishableKey,
    isConfigured: url.length > 0 && publishableKey.length > 0,
  };
}

/** Public origin used in auth email redirects. Never hard-code production. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return 'http://localhost:3000';
}

/**
 * Server-only secret key for privileged Job Engine writes.
 * Prefer `SUPABASE_SECRET_KEY` (sb_secret_…). Legacy
 * `SUPABASE_SERVICE_ROLE_KEY` is accepted as a fallback.
 * Never read this from a NEXT_PUBLIC_* variable. Unit tests do not
 * require either key.
 */
export function getSupabaseSecretEnv(): {
  secretKey: string;
  isConfigured: boolean;
} {
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''
  ).trim();
  return {
    secretKey,
    isConfigured: secretKey.length > 0,
  };
}
