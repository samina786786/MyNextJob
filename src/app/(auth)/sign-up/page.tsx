import type { Metadata } from 'next';
import { redirectIfAuthenticated } from '@/lib/auth/session';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { SignUpForm } from '@/features/auth/components/SignUpForm';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <RouteSuspense>
      <SignUpContent />
    </RouteSuspense>
  );
}

async function SignUpContent() {
  await redirectIfAuthenticated();

  return (
    <AuthCard title="Create your account" description="Your next opportunity starts here.">
      <SignUpForm />
    </AuthCard>
  );
}
