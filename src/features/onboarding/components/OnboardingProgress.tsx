'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const STEPS = [
  { slug: 'resume', label: 'Resume' },
  { slug: 'profile', label: 'Profile' },
  { slug: 'preferences', label: 'Preferences' },
] as const;

export function OnboardingProgress() {
  const pathname = usePathname();
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((step) => pathname?.includes(`/onboarding/${step.slug}`)),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">
        Step {currentIndex + 1} of {STEPS.length}
      </p>
      <ol className="flex items-center gap-1.5" aria-label="Onboarding progress">
        {STEPS.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          return (
            <li key={step.slug} className="flex min-w-0 flex-1 items-center gap-1.5">
              <div
                className={cn(
                  'flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-clay-lg px-2 text-center text-xs font-medium',
                  state === 'current' && 'bg-primary text-primary-foreground shadow-clay-pressed',
                  state === 'done' && 'bg-primary-soft text-primary-deep shadow-clay-soft',
                  state === 'upcoming' && 'bg-surface-raised text-secondary shadow-clay-raised',
                )}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                {index + 1} {step.label}
              </div>
              {index < STEPS.length - 1 ? (
                <span aria-hidden="true" className="h-1 w-3 shrink-0 rounded-full bg-surface-pressed" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
