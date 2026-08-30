import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { clayButton } from '@/components/clay/clayButtonStyles';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClayInput } from '@/components/clay/ClayInput';
import { SampleJobCard } from '@/components/jobs/SampleJobCard';
import { FilterChipStrip } from '@/components/home/FilterChipStrip';
import { SAMPLE_JOBS } from '@/features/jobs/sample-data';
import { getAuthIdentity } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Public landing. Sample cards are a design preview — not live jobs.
 */
export default async function LandingPage() {
  const identity = await getAuthIdentity();

  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">
          MyNextJob
        </p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">
          Your next opportunity starts here.
        </h1>
        <p className="text-[15px] text-secondary">
          Discover fresh jobs matched to your resume — then we&apos;ll tell you when they appear.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {identity ? (
          <Link
            href="/home"
            className={`${clayButton({ variant: 'primary', size: 'lg', block: true })} col-span-2`}
          >
            Open MyNextJob
          </Link>
        ) : (
          <>
            <Link href="/sign-up" className={clayButton({ variant: 'primary', size: 'lg', block: true })}>
              Get started
            </Link>
            <Link href="/sign-in" className={clayButton({ variant: 'secondary', size: 'lg', block: true })}>
              Sign in
            </Link>
          </>
        )}
      </div>

      <ClayCard depth="raised" radius="xl" padding="lg" className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-clay-lg bg-primary text-primary-foreground shadow-clay-raised">
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">See how matches will look</p>
          <p className="text-sm text-secondary">Preview only — not live jobs.</p>
        </div>
      </ClayCard>

      <ClayInput
        leading={<Search size={18} aria-hidden="true" />}
        placeholder="Search roles, companies, skills…"
        aria-label="Search jobs"
        readOnly
      />

      <FilterChipStrip />

      <section aria-label="Sample job match preview" className="space-y-4">
        {SAMPLE_JOBS.map((job) => (
          <SampleJobCard key={job.id} job={job} />
        ))}
      </section>

      <p className="pt-2 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
        Sample data · Product preview
      </p>
    </div>
  );
}
