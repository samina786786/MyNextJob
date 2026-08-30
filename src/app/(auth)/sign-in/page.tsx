import type { Metadata } from 'next';
import { redirectIfAuthenticated } from '@/lib/auth/session';
import { sanitizeNext } from '@/features/auth/redirects';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { SignInForm } from '@/features/auth/components/SignInForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfAuthenticated();
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  return (
    <AuthCard title="Welcome back" description="Your next opportunity starts here.">
      <SignInForm next={next} />
    </AuthCard>
  );
}
