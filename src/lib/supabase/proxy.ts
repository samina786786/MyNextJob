import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicEnv } from './env';

/**
 * Session-refresh helper for the Next.js 16 `proxy.ts` convention.
 *
 * Refreshes cookies via `getClaims()` (trusted JWT verification). Does not
 * load profiles, query the database, or enforce login redirects — those
 * belong on protected Server Components / layouts.
 *
 * `@supabase/ssr` 0.12+ passes cache headers as the second `setAll`
 * argument. Those must land on the response so CDNs cannot cache a
 * refreshed session for another user.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // Must run between createServerClient() and returning the response so a
  // near-expiry refresh is written back onto supabaseResponse.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
