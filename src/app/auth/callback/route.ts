import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { logAuthError } from '@/features/auth/errors';
import { sanitizeNext } from '@/features/auth/redirects';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'), '/reset-password');
  const errorUrl = new URL('/error', origin);

  if (!code) {
    return NextResponse.redirect(errorUrl);
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logAuthError('callback', error);
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}
