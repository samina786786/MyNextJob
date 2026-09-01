import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { RouteSuspense } from '@/components/shell/RouteSuspense';
import { JobsFeedSection } from '@/features/jobs/components/JobsFeedSection';
import { JobsFeedSkeleton } from '@/features/jobs/components/JobCardSkeleton';
import { requireAuth } from '@/lib/auth/session';
import { gateHomeOrProfile } from '@/lib/onboarding/gate';
import { firstNameFrom, timeOfDayGreeting } from '@/lib/onboarding/greeting';

export const metadata: Metadata = { title: 'Home' };

async function HomeContent() {
  const identity = await requireAuth('/home');
  const snapshot = await gateHomeOrProfile(identity.userId);
  const name = firstNameFrom(snapshot.fullName) ?? firstNameFrom(identity.fullName);
  const greeting = name ? `${timeOfDayGreeting()}, ${name}` : timeOfDayGreeting();
  const location = [snapshot.city, snapshot.country].filter(Boolean).join(', ');

  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">MyNextJob</p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">{greeting}</h1>
        <p className="text-[15px] text-secondary">
          {snapshot.headline ? snapshot.headline : 'Your job profile is ready.'}
          {location ? ` · ${location}` : ''}
        </p>
        <p>
          <Link
            href="/profile"
            className="text-sm font-medium text-primary-deep underline-offset-2 hover:underline"
          >
            View profile
          </Link>
        </p>
      </header>

      <section aria-labelledby="fresh-jobs-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="fresh-jobs-heading" className="text-[22px] font-semibold text-foreground">
            Fresh jobs
          </h2>
          <p className="text-[15px] text-secondary">Latest opportunities from the active catalog.</p>
        </div>
        <Suspense fallback={<JobsFeedSkeleton count={5} />}>
          <JobsFeedSection />
        </Suspense>
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <RouteSuspense>
      <HomeContent />
    </RouteSuspense>
  );
}
