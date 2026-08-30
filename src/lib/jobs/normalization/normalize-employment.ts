import type { EmploymentType, RemoteType } from '@/lib/jobs/types';
import { comparisonKey } from '@/lib/jobs/normalization/text';

const EMPLOYMENT_MAP: Record<string, EmploymentType> = {
  full_time: 'full_time',
  fulltime: 'full_time',
  'full time': 'full_time',
  'full-time': 'full_time',
  permanent: 'full_time',
  part_time: 'part_time',
  parttime: 'part_time',
  'part time': 'part_time',
  'part-time': 'part_time',
  contract: 'contract',
  contractor: 'contract',
  freelance: 'freelance',
  intern: 'internship',
  internship: 'internship',
  temporary: 'temporary',
  temp: 'temporary',
  unknown: 'unknown',
};

/**
 * Map common ATS labels. Unspecified values stay `unknown`.
 * "Permanent" is treated as full_time; blank/garbage is unknown.
 */
export function normalizeEmploymentType(value: string | null | undefined): EmploymentType {
  if (value == null || value.trim() === '') return 'unknown';
  const key = comparisonKey(value).replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  const compact = key.replace(/[\s-]/g, '');
  return EMPLOYMENT_MAP[key] ?? EMPLOYMENT_MAP[compact] ?? 'unknown';
}

const REMOTE_MAP: Record<string, RemoteType> = {
  remote: 'remote',
  'work from home': 'remote',
  wfh: 'remote',
  'work-from-home': 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
  'on-site': 'onsite',
  'on site': 'onsite',
  office: 'onsite',
  unknown: 'unknown',
};

export function normalizeRemoteLabel(value: string | null | undefined): RemoteType {
  if (value == null || value.trim() === '') return 'unknown';
  const key = comparisonKey(value);
  if (REMOTE_MAP[key]) return REMOTE_MAP[key];
  if (/\bremote\b/.test(key)) return 'remote';
  if (/\bhybrid\b/.test(key)) return 'hybrid';
  if (/\bon[-\s]?site\b/.test(key) || /\boffice\b/.test(key)) return 'onsite';
  return 'unknown';
}
