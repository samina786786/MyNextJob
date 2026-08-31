import 'server-only';

import type {
  AdapterFetchResult,
  JobSourceAdapter,
  JobSourceContext,
} from '@/lib/jobs/adapters/types';
import {
  ASHBY_CAREERS_ORIGIN,
  ASHBY_MAX_JOBS,
  ashbyBoardUrl,
  assertAshbyBoardName,
  fetchAshbyJson,
  type AshbyFetchOptions,
} from '@/lib/jobs/adapters/ashby-http';
import {
  ashbyBoardSchema,
  ashbyJobSchema,
  type AshbyCompensation,
  type AshbyCompensationComponent,
  type AshbyJob,
} from '@/lib/jobs/adapters/ashby-schema';
import { AdapterFetchError } from '@/lib/jobs/errors';
import { logJobEngine } from '@/lib/jobs/logging';
import type {
  EmploymentType,
  NormalizedJobInput,
  RemoteType,
  SalaryInput,
  SalaryPeriod,
} from '@/lib/jobs/types';

export type AshbyAdapterOptions = AshbyFetchOptions & {
  boardName?: string;
  includeCompensation?: boolean;
  maxJobs?: number;
};

export type AshbyMapFailure = {
  ok: false;
  reason: 'malformed_id' | 'missing_title' | 'invalid_job';
  externalId?: string;
};

export type AshbyMapSuccess = {
  ok: true;
  job: NormalizedJobInput;
  identityFromJobUrl: boolean;
  workplaceInconsistent: boolean;
};

export type AshbyMapResult = AshbyMapSuccess | AshbyMapFailure;

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ASHBY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inferAshbyRemoteFromLocation(locationText: string | null | undefined): RemoteType {
  if (!locationText) return 'unknown';
  if (REMOTE_RE.test(locationText)) return 'remote';
  if (HYBRID_RE.test(locationText)) return 'hybrid';
  return 'unknown';
}

function mapWorkplaceType(value: string): RemoteType {
  switch (value.trim()) {
    case 'Remote':
      return 'remote';
    case 'Hybrid':
      return 'hybrid';
    case 'OnSite':
      return 'onsite';
    default:
      return 'unknown';
  }
}

/**
 * workplaceType is authoritative. isRemote is used only when workplaceType
 * is missing. Location-text inference is last. Description is never scanned.
 */
export function mapAshbyWorkplace(
  workplaceType: string | null | undefined,
  isRemote: boolean | null | undefined,
  locationText: string | null | undefined,
): { remoteType: RemoteType; inconsistent: boolean } {
  if (workplaceType != null && workplaceType.trim() !== '') {
    const remoteType = mapWorkplaceType(workplaceType);
    const inconsistent =
      (remoteType === 'remote' && isRemote === false) ||
      (remoteType === 'onsite' && isRemote === true);
    return { remoteType, inconsistent };
  }
  if (isRemote === true) {
    return { remoteType: 'remote', inconsistent: false };
  }
  return { remoteType: inferAshbyRemoteFromLocation(locationText), inconsistent: false };
}

export function mapAshbyEmploymentType(value: string | null | undefined): EmploymentType {
  if (value == null || value.trim() === '') return 'unknown';
  switch (value.trim()) {
    case 'FullTime':
      return 'full_time';
    case 'PartTime':
      return 'part_time';
    case 'Intern':
      return 'internship';
    case 'Contract':
      return 'contract';
    case 'Temporary':
      return 'temporary';
    default:
      return 'unknown';
  }
}

export function mapAshbySalaryInterval(interval: string | null | undefined): SalaryPeriod | null {
  if (interval == null || interval.trim() === '') return null;
  const key = interval.trim().toLowerCase().replace(/\s+/g, ' ');
  if (key === '1 year' || key === 'year' || key === 'yearly' || key === 'annual') return 'year';
  if (key === '1 month' || key === 'month' || key === 'monthly') return 'month';
  if (key === '1 day' || key === 'day' || key === 'daily') return 'day';
  if (key === '1 hour' || key === 'hour' || key === 'hourly') return 'hour';
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function salaryFromComponent(component: AshbyCompensationComponent): SalaryInput | null {
  if (component.compensationType !== 'Salary') return null;
  const min = finiteNumber(component.minValue);
  const max = finiteNumber(component.maxValue);
  if (min == null && max == null) return null;
  if (min != null && max != null && min > max) return null;
  const currency =
    typeof component.currencyCode === 'string' && component.currencyCode.trim()
      ? component.currencyCode.trim().toUpperCase()
      : null;
  return {
    min,
    max,
    currency,
    period: mapAshbySalaryInterval(component.interval),
  };
}

function salaryKey(salary: SalaryInput): string {
  return `${salary.min ?? ''}|${salary.max ?? ''}|${salary.currency ?? ''}|${salary.period ?? ''}`;
}

function uniqueSalaries(components: AshbyCompensationComponent[]): SalaryInput[] {
  const unique = new Map<string, SalaryInput>();
  for (const component of components) {
    const salary = salaryFromComponent(component);
    if (!salary) continue;
    unique.set(salaryKey(salary), salary);
  }
  return [...unique.values()];
}

/**
 * Map only unambiguous Salary components. Bonus / equity / commission
 * never become salary_min/max. Multiple conflicting tiers stay null.
 * Human-readable compensation strings are not parsed.
 */
export function mapAshbyCompensation(compensation: AshbyCompensation | null | undefined): SalaryInput | null {
  if (!compensation) return null;
  const summary = uniqueSalaries(compensation.summaryComponents ?? []);
  if (summary.length === 1) return summary[0] ?? null;
  if (summary.length > 1) return null;

  const fromTiers = uniqueSalaries(
    (compensation.compensationTiers ?? []).flatMap((tier) => tier.components ?? []),
  );
  if (fromTiers.length === 1) return fromTiers[0] ?? null;
  return null;
}

export function ashbyExternalId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

export function extractAshbyIdFromJobUrl(
  jobUrl: string | null | undefined,
  boardName: string,
): string | null {
  if (!jobUrl?.trim()) return null;
  try {
    const url = new URL(jobUrl.trim());
    if (url.hostname !== 'jobs.ashbyhq.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0] !== boardName) return null;
    const candidate = parts[1] ?? '';
    return ASHBY_UUID_RE.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function parseAshbyPublishedAt(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const trimmed = value.trim();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

function usefulText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function postalParts(address: AshbyJob['address']): {
  city: string | null;
  region: string | null;
  country: string | null;
} {
  const postal = address?.postalAddress;
  return {
    city: usefulText(postal?.addressLocality),
    region: usefulText(postal?.addressRegion),
    country: usefulText(postal?.addressCountry),
  };
}

export function ashbyLocation(job: AshbyJob): {
  text: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
} {
  const primaryText = usefulText(job.location);
  const primaryAddress = postalParts(job.address);
  if (primaryText) {
    return { text: primaryText, ...primaryAddress };
  }

  const secondaries = (job.secondaryLocations ?? []).filter((entry) => {
    return Boolean(usefulText(entry.location) || postalParts(entry.address).city);
  });
  if (secondaries.length === 1) {
    const only = secondaries[0];
    return {
      text: usefulText(only?.location),
      ...postalParts(only?.address),
    };
  }

  return { text: null, ...primaryAddress };
}

export function ashbyRawPayload(job: AshbyJob): Record<string, unknown> {
  return {
    id: job.id ?? null,
    location: job.location ?? null,
    secondaryLocations: job.secondaryLocations ?? [],
    department: job.department ?? null,
    team: job.team ?? null,
    isRemote: job.isRemote ?? null,
    workplaceType: job.workplaceType ?? null,
    publishedAt: job.publishedAt ?? null,
    employmentType: job.employmentType ?? null,
    address: job.address ?? null,
    compensation: job.compensation ?? null,
    isListed: job.isListed ?? null,
  };
}

export type MapAshbyJobInput = {
  sourceId: string;
  companyName: string;
  companyId?: string;
  companyDomain?: string | null;
  boardName: string;
};

export function resolveAshbyExternalId(
  job: Pick<AshbyJob, 'id' | 'jobUrl'>,
  boardName: string,
): { externalId: string; identityFromJobUrl: boolean } | null {
  const explicit = ashbyExternalId(job.id);
  if (explicit) {
    return { externalId: explicit, identityFromJobUrl: false };
  }
  const fromUrl = extractAshbyIdFromJobUrl(job.jobUrl, boardName);
  if (fromUrl) {
    return { externalId: fromUrl, identityFromJobUrl: true };
  }
  return null;
}

export function mapAshbyJob(raw: unknown, input: MapAshbyJobInput): AshbyMapResult {
  const parsed = ashbyJobSchema.safeParse(raw);
  if (!parsed.success) {
    const maybeId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
    const externalId = ashbyExternalId(maybeId) ?? undefined;
    if (maybeId !== undefined && externalId == null) {
      return { ok: false, reason: 'malformed_id' };
    }
    return { ok: false, reason: 'invalid_job', externalId };
  }

  const job = parsed.data;
  const identity = resolveAshbyExternalId(job, input.boardName);
  if (!identity) {
    return { ok: false, reason: 'malformed_id' };
  }

  const title = job.title?.trim() ?? '';
  if (!title) {
    return { ok: false, reason: 'missing_title', externalId: identity.externalId };
  }

  const location = ashbyLocation(job);
  const workplace = mapAshbyWorkplace(job.workplaceType, job.isRemote, location.text);
  const jobUrl = job.jobUrl?.trim() ?? '';
  const applyUrl = job.applyUrl?.trim() || jobUrl;

  return {
    ok: true,
    identityFromJobUrl: identity.identityFromJobUrl,
    workplaceInconsistent: workplace.inconsistent,
    job: {
      source: {
        sourceId: input.sourceId,
        externalId: identity.externalId,
      },
      company: {
        companyId: input.companyId,
        name: input.companyName,
        domain: input.companyDomain,
      },
      title,
      location,
      remoteType: workplace.remoteType,
      employmentType: mapAshbyEmploymentType(job.employmentType),
      descriptionHtml: job.descriptionHtml?.trim() || null,
      descriptionText: job.descriptionHtml?.trim() ? null : job.descriptionPlain?.trim() || null,
      department: job.department?.trim() || null,
      team: job.team?.trim() || null,
      salary: mapAshbyCompensation(job.compensation),
      publishedAt: parseAshbyPublishedAt(job.publishedAt),
      applyUrl,
      sourceUrl: jobUrl,
      rawPayload: ashbyRawPayload(job),
    },
  };
}

function rejectionPlaceholder(context: JobSourceContext, failure: AshbyMapFailure): NormalizedJobInput {
  return {
    source: {
      sourceId: context.sourceId,
      externalId: failure.externalId ?? '',
    },
    company: {
      companyId: context.companyId ?? undefined,
      name: context.companyName ?? context.sourceName ?? 'Unknown company',
      domain: context.companyDomain,
    },
    title: failure.reason === 'missing_title' ? '' : 'Invalid Ashby job',
    location: {},
    remoteType: 'unknown',
    employmentType: 'unknown',
    publishedAt: null,
    applyUrl: '',
    sourceUrl: '',
    rawPayload: { rejection: failure.reason },
  };
}

function resolveBoardName(context: JobSourceContext, configured?: string): string {
  const boardName = configured ?? context.externalIdentifier ?? '';
  if (!boardName.trim()) {
    throw new AdapterFetchError('Ashby job board name is missing on job_sources.external_identifier');
  }
  return assertAshbyBoardName(boardName);
}

/**
 * Public Ashby Job Posting API adapter. Fetch + map only.
 * Board name comes from job_sources.external_identifier.
 * One request is one logical board snapshot. Never writes to Supabase.
 */
export class AshbyAdapter implements JobSourceAdapter {
  readonly provider = 'ashby' as const;

  constructor(private readonly options: AshbyAdapterOptions = {}) {}

  async fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult> {
    const boardName = resolveBoardName(context, this.options.boardName);
    const includeCompensation = this.options.includeCompensation ?? true;
    const maxJobs = this.options.maxJobs ?? ASHBY_MAX_JOBS;
    const started = Date.now();

    logJobEngine('ashby_fetch_started', {
      sourceId: context.sourceId,
      boardName,
    });

    const url = ashbyBoardUrl(boardName, includeCompensation);
    const { body } = await fetchAshbyJson(url, boardName, this.options);

    const wrapper = ashbyBoardSchema.safeParse(body);
    if (!wrapper.success) {
      throw new AdapterFetchError(`Ashby board payload was structurally invalid for ${boardName}`);
    }

    const apiVersion = wrapper.data.apiVersion;

    const companyName = context.companyName ?? context.sourceName ?? 'Unknown company';
    const rawJobs = wrapper.data.jobs;
    const capped = rawJobs.length > maxJobs;
    const slice = capped ? rawJobs.slice(0, maxJobs) : rawJobs;

    const jobs: NormalizedJobInput[] = [];
    let rejected = 0;
    let unlistedSkipped = 0;
    let identityFromJobUrl = 0;
    let workplaceInconsistent = 0;

    for (const raw of slice) {
      if (raw && typeof raw === 'object' && (raw as { isListed?: unknown }).isListed === false) {
        unlistedSkipped += 1;
        continue;
      }

      const mapped = mapAshbyJob(raw, {
        sourceId: context.sourceId,
        companyName,
        companyId: context.companyId ?? undefined,
        companyDomain: context.companyDomain,
        boardName,
      });
      if (mapped.ok) {
        if (mapped.identityFromJobUrl) identityFromJobUrl += 1;
        if (mapped.workplaceInconsistent) workplaceInconsistent += 1;
        jobs.push(mapped.job);
      } else {
        rejected += 1;
        jobs.push(rejectionPlaceholder(context, mapped));
      }
    }

    const snapshotComplete = !capped;

    logJobEngine('ashby_fetch_completed', {
      sourceId: context.sourceId,
      boardName,
      apiVersion,
      unexpectedApiVersion: apiVersion !== '1',
      fetched: rawJobs.length,
      listed: rawJobs.length - unlistedSkipped,
      accepted: jobs.length - rejected,
      rejected,
      unlistedSkipped,
      identityFromJobUrl,
      workplaceInconsistent,
      snapshotComplete,
      durationMs: Date.now() - started,
    });

    return {
      jobs,
      snapshotComplete,
      metadata: {
        requestCount: 1,
        pages: 1,
        boardName,
        apiVersion,
        unexpectedApiVersion: apiVersion !== '1',
        careersOrigin: ASHBY_CAREERS_ORIGIN,
        fetched: rawJobs.length,
        listed: rawJobs.length - unlistedSkipped,
        unlistedSkipped,
        rejected,
        identityFromJobUrl,
        workplaceInconsistent,
        capped,
      },
    };
  }
}
