import type { EmploymentType, RemoteType } from '@/lib/jobs/types';

const REMOTE_LABEL: Record<Exclude<RemoteType, 'unknown'>, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

const EMPLOYMENT_LABEL: Record<Exclude<EmploymentType, 'unknown'>, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
  temporary: 'Temporary',
};

export function remoteTypeLabel(remoteType: RemoteType | null | undefined): string | null {
  if (!remoteType || remoteType === 'unknown') return null;
  return REMOTE_LABEL[remoteType];
}

export function employmentTypeLabel(
  employmentType: EmploymentType | null | undefined,
): string | null {
  if (!employmentType || employmentType === 'unknown') return null;
  return EMPLOYMENT_LABEL[employmentType];
}

export function locationDisplay(input: {
  locationText: string | null;
  city: string | null;
  country: string | null;
}): string | null {
  const text = input.locationText?.trim();
  if (text) return text;
  const fallback = [input.city?.trim(), input.country?.trim()].filter(Boolean).join(', ');
  return fallback.length > 0 ? fallback : null;
}

function isRedundantLocation(location: string, remoteLabel: string | null): boolean {
  const normalized = location.trim().toLowerCase();
  if (!normalized) return true;
  if (remoteLabel && normalized === remoteLabel.toLowerCase()) return true;
  if (normalized === 'remote' || normalized === 'worldwide' || normalized === 'anywhere') {
    return true;
  }
  return false;
}

/**
 * Remote is not worldwide. Keep restriction text such as "North America Only".
 */
export function workplaceLines(input: {
  remoteType: RemoteType | null;
  locationText: string | null;
  city: string | null;
  country: string | null;
}): { remote: string | null; location: string | null } {
  const remote = remoteTypeLabel(input.remoteType);
  const location = locationDisplay(input);
  if (remote === 'Remote' && location && isRedundantLocation(location, remote)) {
    return { remote, location: null };
  }
  return { remote, location };
}

export function formatExperience(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} years`;
  if (min != null && max != null) return `${min} years`;
  if (min != null) return `${min}+ years`;
  return `Up to ${max} years`;
}
