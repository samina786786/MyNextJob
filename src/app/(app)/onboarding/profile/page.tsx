import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/session';
import { gateOnboardingPage } from '@/lib/onboarding/gate';
import { loadDefaultResume, loadResumeSkillIds, loadSkillsCatalog } from '@/lib/onboarding/queries';
import { ProfileReviewForm } from '@/features/onboarding/components/ProfileReviewForm';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

export const metadata: Metadata = { title: 'Review profile' };

export default function OnboardingProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  return (
    <RouteSuspense>
      <OnboardingProfileContent searchParams={searchParams} />
    </RouteSuspense>
  );
}

async function OnboardingProfileContent({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  const identity = await requireAuth('/onboarding/profile');
  const params = await searchParams;
  const replace = params.replace === '1';
  const snapshot = await gateOnboardingPage(identity.userId, 'profile', { replace });
  const [resume, catalog] = await Promise.all([loadDefaultResume(identity.userId), loadSkillsCatalog()]);
  const savedSkillIds = resume ? await loadResumeSkillIds(resume.id) : [];
  const suggestions = resume?.parsed_content?.suggestions;
  const detected = resume?.parsed_content?.detectedSkills.map((skill) => skill.skillId) ?? [];
  const skillIds = savedSkillIds.length > 0 ? savedSkillIds : detected;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Here&apos;s what we found.</h1>
        <p className="text-[15px] text-secondary">Review your profile before we start finding jobs for you.</p>
      </header>
      <ProfileReviewForm
        fullName={snapshot.fullName ?? identity.fullName ?? ''}
        headline={snapshot.headline ?? suggestions?.headline ?? ''}
        yearsExperience={snapshot.yearsExperience ?? suggestions?.yearsExperience ?? null}
        city={snapshot.city ?? suggestions?.city ?? ''}
        country={snapshot.country ?? suggestions?.country ?? ''}
        skillIds={skillIds}
        catalog={catalog}
        warnings={resume?.parsed_content?.warnings ?? []}
        next={snapshot.onboardingCompleted ? 'profile' : 'preferences'}
      />
    </div>
  );
}
