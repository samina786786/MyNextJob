'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { forgotPasswordAction } from '@/features/auth/actions';
import { EMPTY_AUTH_STATE } from '@/features/auth/types';
import { AuthField } from './AuthField';
import { AuthSubmit } from './AuthSubmit';

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, EMPTY_AUTH_STATE);

  if (state.status === 'check-email') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[17px] font-semibold text-foreground">Check your inbox</p>
        <p className="text-[15px] text-secondary">
          If an account exists for that email, we&apos;ve sent password reset instructions.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-primary-deep underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-clay-md bg-destructive-soft px-3 py-2 text-sm text-destructive-deep">
          {state.error}
        </p>
      ) : null}
      <AuthField
        id="email"
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.values?.email ?? ''}
        error={state.fieldErrors?.email?.[0]}
      />
      <AuthSubmit pendingLabel="Sending link…">Send reset link</AuthSubmit>
      <p className="text-center text-sm text-secondary">
        Remembered it?{' '}
        <Link href="/sign-in" className="font-medium text-primary-deep underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
