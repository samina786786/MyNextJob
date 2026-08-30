import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { clayButton } from '@/components/clay/clayButtonStyles';
import { ClayBadge } from '@/components/clay/ClayBadge';
import { ClayCard } from '@/components/clay/ClayCard';
import { DownloadResumeButton } from '@/features/onboarding/components/DownloadResumeButton';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { gateHomeOrProfile } from '@/lib/onboarding/gate';
import {
  loadConfirmedSkillNames,
  loadDefaultResume,
  loadJobPreferences,
} from '@/lib/onboarding/queries';

export const metadata: Metadata = { title: 'Profile' };
export const runtime = 'nodejs';

const WORK_MODE_LABEL: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  any: 'Any',
};

function parseBadge(status: string) {
  if (status === 'succeeded') return { tone: 'soft' as const, label: 'Ready' };
  if (status === 'failed') return { tone: 'destructive' as const, label: 'Needs another look' };
  if (status === 'processing') return { tone: 'warning' as const, label: 'Reading' };
  return { tone: 'neutral' as const, label: 'Pending' };
}

export default async function ProfilePage() {
  const identity = await requireAuth('/profile');
  const snapshot = await gateHomeOrProfile(identity.userId);
  const [resume, skills, prefs] = await Promise.all([
    loadDefaultResume(identity.userId),
    loadConfirmedSkillNames(identity.userId),
    loadJobPreferences(identity.userId),
  ]);
  const location = [snapshot.city, snapshot.country].filter(Boolean).join(', ');
  const badge = resume ? parseBadge(resume.parse_status) : null;

  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">Profile</p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">
          {snapshot.fullName ?? identity.fullName ?? 'Your profile'}
        </h1>
        {snapshot.headline ? <p className="text-[15px] text-secondary">{snapshot.headline}</p> : null}
        <p className="text-sm text-secondary">
          {snapshot.yearsExperience != null ? `${snapshot.yearsExperience} years` : 'Experience not set'}
          {location ? ` · ${location}` : ''}
        </p>
      </header>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Skills</p>
        <div className="flex flex-wrap gap-2">
          {skills.length === 0 ? (
            <p className="text-sm text-secondary">No skills saved yet.</p>
          ) : (
            skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex min-h-8 items-center rounded-clay-md bg-primary-soft px-3 text-sm font-medium text-primary-deep shadow-clay-soft"
              >
                {skill}
              </span>
            ))
          )}
        </div>
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Resume</p>
        {resume ? (
          <>
            <p className="text-[15px] font-medium text-foreground">{resume.original_filename}</p>
            <p className="text-sm text-secondary">
              Updated {new Date(resume.updated_at).toLocaleDateString()}
            </p>
            {badge ? <ClayBadge tone={badge.tone}>{badge.label}</ClayBadge> : null}
            <Link
              href="/onboarding/resume?replace=1"
              className={clayButton({ variant: 'secondary', size: 'lg', block: true })}
            >
              Replace resume
            </Link>
            <DownloadResumeButton />
          </>
        ) : (
          <p className="text-sm text-secondary">No resume on file.</p>
        )}
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Job preferences</p>
        <p className="text-[15px] text-foreground">
          {(prefs?.target_roles ?? []).join(' · ') || 'No target roles yet'}
        </p>
        <p className="text-sm text-secondary">
          {(prefs?.work_modes ?? []).map((mode) => WORK_MODE_LABEL[mode] ?? mode).join(' · ') || 'Work style not set'}
        </p>
        <p className="text-sm text-secondary">
          {(prefs?.preferred_locations ?? []).join(' · ') || 'Locations not set'}
        </p>
      </ClayCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/onboarding/profile?replace=1"
          className={clayButton({ variant: 'secondary', size: 'lg', block: true })}
        >
          Edit profile
        </Link>
        <Link
          href="/onboarding/preferences?edit=1"
          className={clayButton({ variant: 'secondary', size: 'lg', block: true })}
        >
          Edit preferences
        </Link>
      </div>

      <SignOutButton />
    </div>
  );
}
