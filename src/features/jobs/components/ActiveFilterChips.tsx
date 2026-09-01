'use client';

import { X } from 'lucide-react';

import { ClayChip } from '@/components/clay/ClayChip';
import type {
  AgeFilter,
  EmploymentFilter,
  FeedFilters,
  WorkModeFilter,
} from '@/lib/jobs/feed/filters';

const WORK_LABELS: Record<WorkModeFilter, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};
const EMPLOYMENT_LABELS: Record<EmploymentFilter, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
  temporary: 'Temporary',
};
const AGE_LABELS: Record<AgeFilter, string> = {
  1: 'Last 24 hours',
  7: 'Last 7 days',
  14: 'Last 14 days',
  30: 'Last 30 days',
};

export function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: FeedFilters;
  onRemove: (patch: Partial<FeedFilters>) => void;
  onClearAll: () => void;
}) {
  const chips: Array<{
    key: string;
    label: string;
    ariaLabel: string;
    remove: () => void;
  }> = [];

  for (const value of filters.work) {
    chips.push({
      key: `work:${value}`,
      label: WORK_LABELS[value],
      ariaLabel: `Remove ${WORK_LABELS[value]} filter`,
      remove: () => onRemove({ work: filters.work.filter((v) => v !== value) }),
    });
  }
  for (const value of filters.employment) {
    chips.push({
      key: `emp:${value}`,
      label: EMPLOYMENT_LABELS[value],
      ariaLabel: `Remove ${EMPLOYMENT_LABELS[value]} filter`,
      remove: () => onRemove({ employment: filters.employment.filter((v) => v !== value) }),
    });
  }
  if (filters.location) {
    chips.push({
      key: `loc:${filters.location}`,
      label: filters.location,
      ariaLabel: `Remove location filter ${filters.location}`,
      remove: () => onRemove({ location: null }),
    });
  }
  if (filters.age !== 30) {
    chips.push({
      key: `age:${filters.age}`,
      label: AGE_LABELS[filters.age],
      ariaLabel: `Remove ${AGE_LABELS[filters.age]} filter`,
      remove: () => onRemove({ age: 30 }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Active filters"
      className="-mx-1 flex flex-wrap items-center gap-2 px-1"
    >
      {chips.map((chip) => (
        <span key={chip.key} role="listitem">
          <ClayChip
            size="sm"
            active
            aria-label={chip.ariaLabel}
            onClick={chip.remove}
            className="pr-2"
          >
            <span>{chip.label}</span>
            <X className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </ClayChip>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-sm font-medium text-primary-deep underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright"
      >
        Clear filters
      </button>
    </div>
  );
}
