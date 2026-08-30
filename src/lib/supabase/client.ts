import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from './env';

/**
 * Browser Supabase client for Client Components, event handlers, and effects.
 * Uses the publishable (anon) key. All authorization is enforced by RLS
 * on the database side — never trust the browser to filter data.
 */
export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
