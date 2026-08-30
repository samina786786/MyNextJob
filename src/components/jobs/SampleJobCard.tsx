'use client';

import { Bookmark, MapPin, Clock } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClayIconButton } from '@/components/clay/ClayIconButton';
import { ClayBadge, toneForMatchScore } from '@/components/clay/ClayBadge';
import type { SampleJob } from '@/features/jobs/sample-data';

/**
 * PHASE 0 VISUAL-ONLY job card. Consumes fictional sample data and does
 * not talk to any real API. Real job cards land in Phase 5.
 */
export function SampleJobCard({ job }: { job: SampleJob }) {
  const reduced = useReducedMotion();
  const matchTone = toneForMatchScore(job.matchScore);

  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-secondary">{job.company}</p>
            <h3 className="text-[17px] font-semibold leading-tight text-foreground">
              {job.role}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} aria-hidden="true" /> {job.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={13} aria-hidden="true" /> {job.freshness}
              </span>
            </div>
          </div>

          <ClayIconButton aria-label={`Save ${job.role}`} size="md" variant="secondary">
            <Bookmark size={18} strokeWidth={2.25} />
          </ClayIconButton>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {job.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex h-7 items-center rounded-clay-md bg-primary-soft px-2.5 text-xs font-medium text-primary-deep shadow-clay-soft"
            >
              {skill}
            </span>
          ))}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <ClayBadge tone={matchTone} size="lg">
            {job.matchScore}% match
          </ClayBadge>
          <p className="text-xs text-muted-foreground">{job.matchExplanation}</p>
        </footer>
      </ClayCard>
    </motion.div>
  );
}
