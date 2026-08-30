'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '@/features/auth/actions';
import { EMPTY_AUTH_STATE } from '@/features/auth/types';
import { AuthField } from './AuthField';
import { AuthSubmit } from './AuthSubmit';
import { PasswordField } from './PasswordField';

export function SignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signInAction, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        error={state.fieldErrors?.password?.[0]}
      />
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary-deep underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <AuthSubmit pendingLabel="Signing in…">Sign in</AuthSubmit>
      <p className="text-center text-sm text-secondary">
        New here?{' '}
        <Link href="/sign-up" className="font-medium text-primary-deep underline-offset-4 hover:underline">
          Create account
        </Link>
      </p>
    </form>
  );
}
