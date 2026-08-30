import { AppShell } from '@/components/shell/AppShell';
import { OnboardingProgress } from '@/features/onboarding/components/OnboardingProgress';

export const runtime = 'nodejs';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={false} compact homeHref="/home">
      <div className="space-y-6 px-4 pt-2 safe-top">
        <OnboardingProgress />
        {children}
      </div>
    </AppShell>
  );
}
