'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';

import { ClayBadge } from '@/components/clay/ClayBadge';
import { ClayCard } from '@/components/clay/ClayCard';
import { CompanyLogoTile } from '@/features/jobs/components/CompanyLogoTile';
import type { FeedCardJob } from '@/lib/jobs/feed/card';
import { freshnessWording } from '@/lib/jobs/feed/relative-time';
import { formatSalary } from '@/lib/jobs/feed/salary-display';
import { employmentTypeLabel, workplaceLines } from '@/lib/jobs/feed/workplace';

export function JobCard({
  job,
  asOf,
  appear = false,
  priority = false,
}: {
  job: FeedCardJob;
  asOf: string;
  appear?: boolean;
  priority?: boolean;
}) {
  const reduced = useReducedMotion();
  const freshness = freshnessWording({
    publishedAt: job.publishedAt,
    discoveredAt: job.discoveredAt,
    asOf,
  });
  const workplace = workplaceLines(job);
  const salary = formatSalary(job);
  const employment = employmentTypeLabel(job.employmentType);
  const company = job.companyName?.trim() || 'Company';

  const card = (
    <ClayCard depth="raised" radius="xl" padding="lg" className="h-full space-y-3">
      <div className="flex items-start gap-3">
        <CompanyLogoTile name={job.companyName} logoUrl={job.companyLogoUrl} priority={priority} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[17px] font-semibold leading-snug text-foreground">
            {job.title}
          </h3>
          <p className="mt-0.5 truncate text-sm text-secondary">{company}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {workplace.remote ? (
          <ClayBadge tone="soft" size="sm">
            {workplace.remote}
          </ClayBadge>
        ) : null}
        {workplace.location ? (
          <ClayBadge tone="neutral" size="sm">
            {workplace.location}
          </ClayBadge>
        ) : null}
        {employment ? (
          <ClayBadge tone="neutral" size="sm">
            {employment}
          </ClayBadge>
        ) : null}
        {salary ? (
          <ClayBadge tone="emerald" size="sm">
            {salary}
          </ClayBadge>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <time dateTime={freshness.datetime}>{freshness.label}</time>
        {job.sourceLabel ? <span>Source: {job.sourceLabel}</span> : null}
      </footer>
    </ClayCard>
  );

  const link = (
    <Link
      href={`/jobs/${job.id}`}
      data-job-id={job.id}
      className="block rounded-clay-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright"
    >
      <article>{card}</article>
    </Link>
  );

  if (!appear || reduced) return link;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {link}
    </motion.div>
  );
}
