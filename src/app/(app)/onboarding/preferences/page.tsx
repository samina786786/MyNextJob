import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/session';
import { gateOnboardingPage } from '@/lib/onboarding/gate';
import { loadJobPreferences } from '@/lib/onboarding/queries';
import { PreferencesForm } from '@/features/onboarding/components/PreferencesForm';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

export const metadata: Metadata = { title: 'Job preferences' };

export default function OnboardingPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  return (
    <RouteSuspense>
      <OnboardingPreferencesContent searchParams={searchParams} />
    </RouteSuspense>
  );
}

async function OnboardingPreferencesContent({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const identity = await requireAuth('/onboarding/preferences');
  const params = await searchParams;
  const edit = params.edit === '1';
  const snapshot = await gateOnboardingPage(identity.userId, 'preferences', { edit });
  const prefs = await loadJobPreferences(identity.userId);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">What are you looking for next?</h1>
        <p className="text-[15px] text-secondary">This is what you want now — not only what your resume already shows.</p>
      </header>
      <PreferencesForm
        targetRoles={prefs?.target_roles ?? []}
        preferredLocations={prefs?.preferred_locations ?? []}
        workModes={prefs?.work_modes ?? []}
        employmentTypes={prefs?.employment_types ?? []}
        minimumSalary={prefs?.minimum_salary ?? null}
        currency={prefs?.currency ?? 'USD'}
        minimumMatchScore={prefs?.minimum_match_score ?? 75}
        excludedKeywords={prefs?.excluded_keywords ?? []}
        complete={!edit && !snapshot.onboardingCompleted}
      />
    </div>
  );
}
