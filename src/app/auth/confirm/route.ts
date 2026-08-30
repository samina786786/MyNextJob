import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { logAuthError } from '@/features/auth/errors';

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const errorUrl = new URL('/error', origin);

  if (!tokenHash || !isEmailOtpType(type)) {
    return NextResponse.redirect(errorUrl);
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    logAuthError('confirm', error);
    return NextResponse.redirect(errorUrl);
  }

  const destination = type === 'recovery' ? '/reset-password' : '/home';
  return NextResponse.redirect(new URL(destination, origin));
}
