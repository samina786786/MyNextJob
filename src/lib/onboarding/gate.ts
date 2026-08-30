import { redirect } from 'next/navigation';
import { deriveOnboardingStep, pathForStep, type OnboardingStep, type OnboardingSnapshot } from './progress';
import { loadOnboardingSnapshot } from './queries';

const ORDER: OnboardingStep[] = ['resume', 'profile', 'preferences'];

export async function gateHomeOrProfile(userId: string): Promise<OnboardingSnapshot> {
  const snapshot = await loadOnboardingSnapshot(userId);
  const step = deriveOnboardingStep(snapshot);
  if (step !== 'done') redirect(pathForStep(step));
  return snapshot;
}

export async function gateOnboardingPage(
  userId: string,
  page: Exclude<OnboardingStep, 'done'>,
  options: { replace?: boolean; edit?: boolean } = {},
): Promise<OnboardingSnapshot> {
  const snapshot = await loadOnboardingSnapshot(userId);
  const step = deriveOnboardingStep(snapshot);

  if (step === 'done') {
    if (options.replace && (page === 'resume' || page === 'profile')) return snapshot;
    if (options.edit && page === 'preferences') return snapshot;
    redirect('/home');
  }

  if (page === 'resume' && snapshot.hasSucceededResume && !options.replace) {
    redirect(pathForStep(step));
  }

  const stepIndex = ORDER.indexOf(step);
  const pageIndex = ORDER.indexOf(page);
  if (pageIndex > stepIndex) redirect(pathForStep(step));
  return snapshot;
}
