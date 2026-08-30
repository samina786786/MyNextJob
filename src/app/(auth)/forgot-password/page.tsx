import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We'll send instructions if an account exists.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
