'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from '@/features/auth/actions';
import { EMPTY_AUTH_STATE } from '@/features/auth/types';
import { AuthField } from './AuthField';
import { AuthSubmit } from './AuthSubmit';
import { PasswordField } from './PasswordField';

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, EMPTY_AUTH_STATE);

  if (state.status === 'check-email') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[17px] font-semibold text-foreground">Check your inbox</p>
        <p className="text-[15px] text-secondary">
          We sent a confirmation link to{' '}
          <span className="font-medium text-foreground">{state.email}</span>.
          Confirm your email to continue.
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
        id="fullName"
        name="fullName"
        label="Full name"
        type="text"
        autoComplete="name"
        defaultValue={state.values?.fullName ?? ''}
        error={state.fieldErrors?.fullName?.[0]}
      />
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
      <PasswordField
        id="password"
        name="password"
        label="Password"
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
      <AuthSubmit pendingLabel="Creating account…">Create account</AuthSubmit>
      <p className="text-center text-sm text-secondary">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-primary-deep underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
