import type { Metadata } from 'next';
import { redirectIfAuthenticated } from '@/lib/auth/session';
import { sanitizeNext } from '@/features/auth/redirects';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <RouteSuspense>
      <SignInContent searchParams={searchParams} />
    </RouteSuspense>
  );
}

async function SignInContent({
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
