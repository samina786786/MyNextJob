import { afterEach, describe, expect, it } from 'vitest';

import { getSupabaseSecretEnv } from '@/lib/supabase/env';

describe('getSupabaseSecretEnv', () => {
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const originalLegacy = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
    if (originalLegacy === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalLegacy;
    delete process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY;
  });

  it('ignores NEXT_PUBLIC_* impersonation of the secret', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY = 'sb_secret_should_not_count';
    const env = getSupabaseSecretEnv();
    expect(env.isConfigured).toBe(false);
    expect(env.secretKey).toBe('');
  });

  it('prefers SUPABASE_SECRET_KEY over the legacy service_role name', () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-role-key';
    const env = getSupabaseSecretEnv();
    expect(env.isConfigured).toBe(true);
    expect(env.secretKey).toBe('sb_secret_test');
  });
});
