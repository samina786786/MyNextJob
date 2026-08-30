import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { clayButton } from '@/components/clay/clayButtonStyles';

export const metadata: Metadata = {
  title: 'Something went wrong',
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <AuthCard title="Something went wrong" description="This sign-in link may have expired or already been used.">
      <Link href="/sign-in" className={clayButton({ variant: 'primary', size: 'lg', block: true })}>
        Return to sign in
      </Link>
    </AuthCard>
  );
}
