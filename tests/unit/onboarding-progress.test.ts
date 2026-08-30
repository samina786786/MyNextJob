import { describe, expect, it } from 'vitest';
import { deriveOnboardingStep, pathForStep } from '@/lib/onboarding/progress';
import { addUniqueChip, normalizeChip } from '@/lib/validation/chips';

const base = {
  onboardingCompleted: false,
  fullName: 'Alex Candidate',
  headline: null as string | null,
  yearsExperience: null as number | null,
  city: null as string | null,
  country: null as string | null,
  hasSucceededResume: false,
  resumeParseStatus: null,
};

describe('onboarding progress', () => {
  it('starts at resume until a parse succeeds', () => {
    expect(deriveOnboardingStep(base)).toBe('resume');
    expect(pathForStep('resume')).toBe('/onboarding/resume');
  });

  it('moves to profile after a successful parse', () => {
    expect(deriveOnboardingStep({ ...base, hasSucceededResume: true })).toBe('profile');
  });

  it('moves to preferences after a headline is saved', () => {
    expect(
      deriveOnboardingStep({ ...base, hasSucceededResume: true, headline: 'Frontend Engineer' }),
    ).toBe('preferences');
  });

  it('is done only when onboarding_completed is true', () => {
    expect(
      deriveOnboardingStep({
        ...base,
        hasSucceededResume: true,
        headline: 'Frontend Engineer',
        onboardingCompleted: true,
      }),
    ).toBe('done');
    expect(pathForStep('done')).toBe('/home');
  });
});

describe('chip helpers', () => {
  it('normalizes whitespace and skips duplicates', () => {
    expect(normalizeChip('  React   Developer  ')).toBe('React Developer');
    expect(addUniqueChip(['React Developer'], 'react developer', 10)).toEqual(['React Developer']);
    expect(addUniqueChip(['React'], 'Next.js', 10)).toEqual(['React', 'Next.js']);
  });
});
