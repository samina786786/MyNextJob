import type {
  EmploymentType,
  JobSourceProvider,
  JobStatus,
  RemoteType,
  SalaryPeriod,
} from '@/lib/jobs/types';

/**
 * Postgres enum / constraint values the Job Engine may persist.
 * Contract-only values (unknown, synthetic) are mapped here — they are
 * not added to live enums.
 */
export const DB_SOURCE_TYPES = [
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'we_work_remotely',
  'rss',
  'custom',
] as const;

export type DbSourceType = (typeof DB_SOURCE_TYPES)[number];

export type DbRemoteType = 'remote' | 'hybrid' | 'onsite';

export type DbEmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance'
  | 'internship'
  | 'temporary';

export type DbSalaryPeriod = 'hour' | 'day' | 'month' | 'year';

export const PG_UNIQUE_VIOLATION = '23505';

export function isPgUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === PG_UNIQUE_VIOLATION;
}

/** Test/dev synthetic adapter → live `custom`. Never persist `synthetic`. */
export function toDbSourceType(provider: JobSourceProvider): DbSourceType {
  if (provider === 'synthetic') return 'custom';
  if ((DB_SOURCE_TYPES as readonly string[]).includes(provider)) {
    return provider as DbSourceType;
  }
  return 'custom';
}

/**
 * remote_type enum is remote | hybrid | onsite | any.
 * Ingestion never writes `any` (that's a preference wildcard) or `unknown`.
 */
export function toDbRemoteType(value: RemoteType | null | undefined): DbRemoteType | null {
  if (value === 'remote' || value === 'hybrid' || value === 'onsite') return value;
  return null;
}

/**
 * employment_type enum includes part_time, temporary, freelance.
 * Engine `unknown` → NULL.
 */
export function toDbEmploymentType(
  value: EmploymentType | null | undefined,
): DbEmploymentType | null {
  if (
    value === 'full_time' ||
    value === 'part_time' ||
    value === 'contract' ||
    value === 'freelance' ||
    value === 'internship' ||
    value === 'temporary'
  ) {
    return value;
  }
  return null;
}

/** salary_period check: hour | day | month | year. `unknown` → NULL. */
export function toDbSalaryPeriod(
  value: SalaryPeriod | null | undefined,
): DbSalaryPeriod | null {
  if (value === 'hour' || value === 'day' || value === 'month' || value === 'year') {
    return value;
  }
  return null;
}

export function toDbJobStatus(value: JobStatus): JobStatus {
  return value;
}
