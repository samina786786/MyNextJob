import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { PersistenceError } from '@/lib/jobs/errors';
import { getSupabasePublicEnv, getSupabaseSecretEnv } from '@/lib/supabase/env';

/**
 * Privileged server client. Bypasses RLS. Requires table GRANTs on
 * service_role (see 0005). Never import from Client Components.
 */
export function createAdminClient(): SupabaseClient {
  const { url } = getSupabasePublicEnv();
  const { secretKey, isConfigured } = getSupabaseSecretEnv();
  if (!url || !isConfigured) {
    throw new PersistenceError(
      'SUPABASE_SECRET_KEY is not configured for privileged Job Engine writes',
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
