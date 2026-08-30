import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/session';
import { ClayCard } from '@/components/clay/ClayCard';
import { SignOutButton } from '@/features/auth/components/SignOutButton';

export const metadata: Metadata = {
  title: 'Home',
};

export default async function HomePage() {
  const identity = await requireAuth('/home');
  const greeting = identity.fullName ? `Welcome, ${identity.fullName}.` : 'Welcome to MyNextJob.';

  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">
          MyNextJob
        </p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">{greeting}</h1>
        <p className="text-[15px] text-secondary">Your account is ready.</p>
      </header>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-[15px] text-foreground">
          Next, we&apos;ll build your job profile from your resume.
        </p>
        <p className="text-sm text-secondary">
          Resume upload lands in the next phase. For now you can explore the preview on the
          public home or sign out.
        </p>
      </ClayCard>

      <SignOutButton />
    </div>
  );
}
