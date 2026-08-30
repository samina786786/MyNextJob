import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { sanitizeNext } from '@/features/auth/redirects';

export interface AuthIdentity {
  userId: string;
  email: string | null;
  fullName: string | null;
}

function readClaim(claims: Record<string, unknown>, key: string): unknown {
  return claims[key];
}

function identityFromClaims(claims: Record<string, unknown>): AuthIdentity | null {
  const sub = readClaim(claims, 'sub');
  if (typeof sub !== 'string' || sub.length === 0) return null;

  const email = readClaim(claims, 'email');
  const metadata = readClaim(claims, 'user_metadata');
  const fullName =
    metadata && typeof metadata === 'object' && metadata !== null && 'full_name' in metadata
      ? (metadata as { full_name?: unknown }).full_name
      : undefined;

  return {
    userId: sub,
    email: typeof email === 'string' ? email : null,
    fullName: typeof fullName === 'string' && fullName.trim().length > 0 ? fullName.trim() : null,
  };
}

/**
 * Trusted identity for server-side route protection. Uses `getClaims()`,
 * never `getSession()`. Returns null when Supabase is unconfigured or
 * the caller has no valid JWT.
 */
export async function getAuthIdentity(): Promise<AuthIdentity | null> {
  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  return identityFromClaims(data.claims as Record<string, unknown>);
}

export async function requireAuth(nextPath = '/home'): Promise<AuthIdentity> {
  const identity = await getAuthIdentity();
  if (!identity) {
    const next = sanitizeNext(nextPath);
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  return identity;
}

export async function redirectIfAuthenticated(destination = '/home'): Promise<void> {
  const identity = await getAuthIdentity();
  if (identity) {
    redirect(sanitizeNext(destination));
  }
}
