'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl, getSupabasePublicEnv } from '@/lib/supabase/env';
import { getAuthIdentity } from '@/lib/auth/session';
import { logAuthError, mapAuthError } from './errors';
import { DEFAULT_AUTH_REDIRECT, sanitizeNext } from './redirects';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from './schemas';
import type { AuthActionState } from './types';

function fieldErrorsFromZod(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return error.flatten().fieldErrors;
}

function notConfigured(): AuthActionState {
  return { error: "MyNextJob isn't connected to an auth service yet." };
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  const retained = {
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
  };

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values: retained };
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) return { ...notConfigured(), values: retained };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    logAuthError('signUp', error);
    return { error: mapAuthError(error.message), values: retained };
  }

  if (data.session) {
    redirect(DEFAULT_AUTH_REDIRECT);
  }

  return { status: 'check-email', email: parsed.data.email };
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const next = sanitizeNext(formData.get('next'));
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  const retained = { email: String(formData.get('email') ?? '') };

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values: retained };
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) return { ...notConfigured(), values: retained };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logAuthError('signIn', error);
    return { error: mapAuthError(error.message), values: retained };
  }

  redirect(next);
}

export async function forgotPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });

  const retained = { email: String(formData.get('email') ?? '') };

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values: retained };
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    return { status: 'check-email', email: parsed.data.email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    logAuthError('forgotPassword', error);
  }

  return { status: 'check-email', email: parsed.data.email };
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const identity = await getAuthIdentity();
  if (!identity) {
    return { error: 'This reset link may have expired or already been used.' };
  }

  const { isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) return notConfigured();

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    logAuthError('resetPassword', error);
    return { error: mapAuthError(error.message) };
  }

  return { status: 'password-updated' };
}

export async function signOutAction(): Promise<void> {
  const { isConfigured } = getSupabasePublicEnv();
  if (isConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) logAuthError('signOut', error);
  }
  redirect('/sign-in');
}
