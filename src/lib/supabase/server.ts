import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from './env';

/**
 * Server Supabase client for React Server Components, Route Handlers, and
 * Server Actions. Uses the modern getAll/setAll cookie adapter required by
 * `@supabase/ssr` — do NOT reintroduce the deprecated get/set/remove trio.
 *
 * `cookies()` is async in Next.js 16. The setAll call is wrapped in
 * try/catch because Server Components cannot mutate cookies or response
 * headers; `src/proxy.ts` writes both on the next request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy refresh writes the
          // session and cache headers on the next request. This is expected.
        }
      },
    },
  });
}
