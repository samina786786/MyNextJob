export type ParseStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type OnboardingStep = 'resume' | 'profile' | 'preferences' | 'done';

export interface OnboardingSnapshot {
  onboardingCompleted: boolean;
  fullName: string | null;
  headline: string | null;
  yearsExperience: number | null;
  city: string | null;
  country: string | null;
  hasSucceededResume: boolean;
  resumeParseStatus: ParseStatus | null;
}

export function deriveOnboardingStep(snapshot: OnboardingSnapshot): OnboardingStep {
  if (snapshot.onboardingCompleted) return 'done';
  if (!snapshot.hasSucceededResume) return 'resume';
  if (!snapshot.headline?.trim()) return 'profile';
  return 'preferences';
}

export function pathForStep(step: OnboardingStep): string {
  if (step === 'done') return '/home';
  return `/onboarding/${step}`;
}
