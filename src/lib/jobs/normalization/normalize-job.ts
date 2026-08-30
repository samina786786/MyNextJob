import { ValidationError } from '@/lib/jobs/errors';
import { parseNormalizedJobInput } from '@/lib/jobs/schemas/normalized-job';
import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { normalizeDomain } from '@/lib/jobs/normalization/normalize-domain';
import {
  inferRemoteType,
  normalizeLocation,
} from '@/lib/jobs/normalization/normalize-location';
import { displayTitle, normalizeTitle } from '@/lib/jobs/normalization/normalize-title';
import { resolveJobUrls } from '@/lib/jobs/normalization/normalize-urls';
import { deriveDescription } from '@/lib/jobs/normalization/sanitize-description';
import { sanitizeRawPayload } from '@/lib/jobs/normalization/payload';
import type {
  EmploymentType,
  NormalizedJobInput,
  RemoteType,
  SalaryInput,
  SalaryPeriod,
} from '@/lib/jobs/types';

export type PreparedJob = {
  sourceId: string;
  externalId: string;
  companyId: string | undefined;
  companyName: string;
  companyNameKey: string;
  companyDomain: string | null;
  title: string;
  titleKey: string;
  locationText: string | null;
  locationComparison: string;
  country: string | null;
  city: string | null;
  region: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  descriptionHtml: string | null;
  descriptionText: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  department: string | null;
  team: string | null;
  publishedAt: Date | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  rawPayload: unknown;
};

export function prepareNormalizedJob(input: unknown): PreparedJob {
  let parsed: NormalizedJobInput;
  try {
    parsed = parseNormalizedJobInput(input);
  } catch {
    throw new ValidationError('invalid_payload', 'Job failed the normalized contract');
  }

  if (!parsed.source?.sourceId) {
    throw new ValidationError('missing_source', 'source.sourceId is required');
  }
  if (!parsed.source.externalId?.trim()) {
    throw new ValidationError('missing_external_id', 'source.externalId is required');
  }
  if (!parsed.company?.name?.trim()) {
    throw new ValidationError('missing_company', 'company.name is required');
  }
  if (!parsed.title?.trim()) {
    throw new ValidationError('missing_title', 'title is required');
  }

  const urls = resolveJobUrls(parsed.applyUrl ?? '', parsed.sourceUrl ?? '');
  const location = normalizeLocation(parsed.location ?? {});
  const remoteType = inferRemoteType(parsed.remoteType, location.text);
  const { html, text } = deriveDescription(parsed);
  const salary = normalizeSalary(parsed.salary);
  const experience = normalizeExperience(parsed.experienceMin, parsed.experienceMax);

  let domain: string | null = null;
  if (parsed.company.domain) {
    domain = normalizeDomain(parsed.company.domain);
  }

  return {
    sourceId: parsed.source.sourceId,
    externalId: parsed.source.externalId.trim(),
    companyId: parsed.company.companyId,
    companyName: parsed.company.name.normalize('NFKC').replace(/\s+/g, ' ').trim(),
    companyNameKey: normalizeCompanyName(parsed.company.name),
    companyDomain: domain,
    title: displayTitle(parsed.title),
    titleKey: normalizeTitle(parsed.title),
    locationText: location.text,
    locationComparison: location.comparison,
    country: location.country,
    city: location.city,
    region: location.region,
    remoteType,
    employmentType: parsed.employmentType,
    descriptionHtml: html,
    descriptionText: text,
    experienceMin: experience.min,
    experienceMax: experience.max,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryPeriod: salary.period,
    department: parsed.department?.trim() || null,
    team: parsed.team?.trim() || null,
    publishedAt: parsePublishedAt(parsed.publishedAt),
    applyUrl: urls.applyUrl,
    sourceUrl: urls.sourceUrl,
    rawPayload: parsed.rawPayload === undefined ? null : sanitizeRawPayload(parsed.rawPayload),
  };
}

function normalizeSalary(salary: SalaryInput | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
} {
  if (!salary) {
    return { min: null, max: null, currency: null, period: null };
  }
  const min = salary.min ?? null;
  const max = salary.max ?? null;
  if (min != null && max != null && min > max) {
    throw new ValidationError('invalid_salary', 'salary.min cannot exceed salary.max');
  }
  const currency = salary.currency?.trim()
    ? salary.currency.trim().toUpperCase()
    : null;
  const period = salary.period && salary.period !== 'unknown' ? salary.period : null;
  return { min, max, currency, period };
}

function normalizeExperience(
  min: number | null | undefined,
  max: number | null | undefined,
): { min: number | null; max: number | null } {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo != null && hi != null && lo > hi) {
    throw new ValidationError('invalid_experience', 'experienceMin cannot exceed experienceMax');
  }
  return { min: lo, max: hi };
}

function parsePublishedAt(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
