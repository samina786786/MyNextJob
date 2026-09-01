import Link from 'next/link';

import { clayButton } from '@/components/clay/clayButtonStyles';
import { ClayBadge } from '@/components/clay/ClayBadge';
import { ClayCard } from '@/components/clay/ClayCard';
import { CompanyLogoTile } from '@/features/jobs/components/CompanyLogoTile';
import { freshnessWording } from '@/lib/jobs/feed/relative-time';
import { formatSalary } from '@/lib/jobs/feed/salary-display';
import type { JobDetailDto } from '@/lib/jobs/feed/supabase-detail';
import {
  employmentTypeLabel,
  formatExperience,
  workplaceLines,
} from '@/lib/jobs/feed/workplace';

function JobDescription({ html, text }: { html: string | null; text: string | null }) {
  if (html) {
    return (
      <div className="job-description" dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  if (text) {
    return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{text}</p>;
  }
  return <p className="text-[15px] text-secondary">No description is available for this job.</p>;
}

export function JobDetailView({ job, asOf }: { job: JobDetailDto; asOf: string }) {
  const freshness = freshnessWording({
    publishedAt: job.publishedAt,
    discoveredAt: job.discoveredAt,
    asOf,
  });
  const workplace = workplaceLines(job);
  const salary = formatSalary(job);
  const employment = employmentTypeLabel(job.employmentType);
  const experience = formatExperience(job.experienceMin, job.experienceMax);
  const company = job.companyName?.trim() || 'Company';

  return (
    <article className="scroll-mb-36 space-y-5 pb-8">
      <header className="space-y-4">
        <div className="flex items-start gap-3">
          <CompanyLogoTile name={job.companyName} logoUrl={job.companyLogoUrl} size="lg" priority />
          <div className="min-w-0">
            <p className="text-sm font-medium text-secondary">{company}</p>
            <h1 className="break-words text-[26px] font-semibold leading-tight text-foreground">
              {job.title}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {workplace.remote ? (
            <ClayBadge tone="soft" size="md">
              {workplace.remote}
            </ClayBadge>
          ) : null}
          {workplace.location ? (
            <ClayBadge tone="neutral" size="md">
              {workplace.location}
            </ClayBadge>
          ) : null}
          {employment ? (
            <ClayBadge tone="neutral" size="md">
              {employment}
            </ClayBadge>
          ) : null}
          {experience ? (
            <ClayBadge tone="neutral" size="md">
              {experience}
            </ClayBadge>
          ) : null}
          {salary ? (
            <ClayBadge tone="emerald" size="md">
              {salary}
            </ClayBadge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <time dateTime={freshness.datetime}>{freshness.label}</time>
          {job.sourceLabel ? ` · Source: ${job.sourceLabel}` : ''}
        </p>
      </header>

      {job.applyUrl ? (
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={clayButton({ variant: 'primary', size: 'lg', block: true })}
        >
          Apply now
        </a>
      ) : null}

      <section aria-labelledby="job-description-heading" className="space-y-3">
        <h2 id="job-description-heading" className="text-lg font-semibold text-foreground">
          Description
        </h2>
        <JobDescription html={job.descriptionHtml} text={job.descriptionText} />
      </section>
    </article>
  );
}

export function JobUnavailableState() {
  return (
    <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
      <h1 className="text-[22px] font-semibold text-foreground">
        This job is no longer in the active catalog.
      </h1>
      <p className="text-[15px] text-secondary">
        It may have closed or fallen outside the 30-day freshness window.
      </p>
      <Link href="/home" className={clayButton({ variant: 'primary', size: 'lg', block: true })}>
        Back to fresh jobs
      </Link>
    </ClayCard>
  );
}
