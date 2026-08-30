import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { clayButton } from '@/components/clay/clayButtonStyles';
import { ClayCard } from '@/components/clay/ClayCard';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { gateHomeOrProfile } from '@/lib/onboarding/gate';
import { firstNameFrom, timeOfDayGreeting } from '@/lib/onboarding/greeting';
import { loadConfirmedSkillNames } from '@/lib/onboarding/queries';

export const metadata: Metadata = { title: 'Home' };
export const runtime = 'nodejs';

export default async function HomePage() {
  const identity = await requireAuth('/home');
  const snapshot = await gateHomeOrProfile(identity.userId);
  const skills = await loadConfirmedSkillNames(identity.userId);
  const name = firstNameFrom(snapshot.fullName) ?? firstNameFrom(identity.fullName);
  const greeting = name ? `${timeOfDayGreeting()}, ${name} 👋` : `${timeOfDayGreeting()} 👋`;
  const location = [snapshot.city, snapshot.country].filter(Boolean).join(', ');

  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">MyNextJob</p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">{greeting}</h1>
        <p className="text-[15px] text-secondary">Your job profile is ready.</p>
      </header>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        {snapshot.headline ? (
          <p className="text-[17px] font-semibold text-foreground">{snapshot.headline}</p>
        ) : null}
        {skills.length > 0 ? (
          <p className="text-[15px] text-foreground">{skills.slice(0, 6).join(' · ')}</p>
        ) : null}
        <p className="text-sm text-secondary">
          {snapshot.yearsExperience != null ? `${snapshot.yearsExperience} years experience` : 'Experience added when you want it.'}
          {location ? ` · ${location}` : ''}
        </p>
        <p className="text-[15px] text-secondary">
          We&apos;re ready to start finding opportunities that match you.
        </p>
        <Link href="/profile" className={clayButton({ variant: 'primary', size: 'lg', block: true })}>
          View profile
        </Link>
      </ClayCard>

      <SignOutButton />
    </div>
  );
}
