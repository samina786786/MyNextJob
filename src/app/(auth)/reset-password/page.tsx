import type { Metadata } from 'next';
import Link from 'next/link';
import { getAuthIdentity } from '@/lib/auth/session';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <RouteSuspense>
      <ResetPasswordContent />
    </RouteSuspense>
  );
}

async function ResetPasswordContent() {
  const identity = await getAuthIdentity();

  if (!identity) {
    return (
      <AuthCard title="Link expired" description="This reset link may have expired or already been used.">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-primary-deep underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="Use at least 8 characters.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
