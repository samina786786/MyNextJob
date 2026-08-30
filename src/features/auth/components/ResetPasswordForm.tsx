'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/features/auth/actions';
import { EMPTY_AUTH_STATE } from '@/features/auth/types';
import { AuthSubmit } from './AuthSubmit';
import { PasswordField } from './PasswordField';

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, EMPTY_AUTH_STATE);

  if (state.status === 'password-updated') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[17px] font-semibold text-foreground">Password updated</p>
        <p className="text-[15px] text-secondary">Your new password is ready.</p>
        <Link
          href="/home"
          className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-primary-deep underline-offset-4 hover:underline"
        >
          Continue to MyNextJob
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
      <PasswordField
        id="password"
        name="password"
        label="New password"
        autoComplete="new-password"
        error={state.fieldErrors?.password?.[0]}
      />
      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword?.[0]}
      />
      <AuthSubmit pendingLabel="Updating…">Update password</AuthSubmit>
    </form>
  );
}
