import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/session';
import { gateOnboardingPage } from '@/lib/onboarding/gate';
import { loadDefaultResume } from '@/lib/onboarding/queries';
import { ResumeUploader } from '@/features/onboarding/components/ResumeUploader';

export const metadata: Metadata = { title: 'Upload resume' };
export const runtime = 'nodejs';

export default async function OnboardingResumePage({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  const identity = await requireAuth('/onboarding/resume');
  const params = await searchParams;
  const replace = params.replace === '1';
  await gateOnboardingPage(identity.userId, 'resume', { replace });
  const resume = await loadDefaultResume(identity.userId);
  const failed = resume?.parse_status === 'failed';

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">MyNextJob</p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Let&apos;s build your job profile.</h1>
        <p className="text-[15px] text-secondary">
          Upload your resume and we&apos;ll extract the information that helps us find better opportunities.
        </p>
      </header>
      <ResumeUploader
        userId={identity.userId}
        replace={replace}
        initialFilename={failed && resume ? resume.original_filename : null}
        initialError={failed ? "We couldn't read this resume." : null}
      />
    </div>
  );
}
