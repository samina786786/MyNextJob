import type { Metadata } from 'next';
import { redirectIfAuthenticated } from '@/lib/auth/session';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { SignUpForm } from '@/features/auth/components/SignUpForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  await redirectIfAuthenticated();

  return (
    <AuthCard title="Create your account" description="Your next opportunity starts here.">
      <SignUpForm />
    </AuthCard>
  );
}
