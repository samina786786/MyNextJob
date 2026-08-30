import 'server-only';

import type {
  AdapterFetchResult,
  JobSourceAdapter,
  JobSourceContext,
} from '@/lib/jobs/adapters/types';
import {
  assertLeverSite,
  fetchLeverJson,
  LEVER_MAX_JOBS,
  LEVER_MAX_PAGES,
  LEVER_PAGE_SIZE,
  leverPostingsUrl,
  resolveLeverInstance,
  type LeverFetchOptions,
  type LeverInstance,
} from '@/lib/jobs/adapters/lever-http';
import { leverJobSchema, type LeverJob } from '@/lib/jobs/adapters/lever-schema';
import { AdapterFetchError } from '@/lib/jobs/errors';
import { logJobEngine } from '@/lib/jobs/logging';
import type { EmploymentType, NormalizedJobInput, RemoteType, SalaryInput, SalaryPeriod } from '@/lib/jobs/types';

export type LeverAdapterOptions = LeverFetchOptions & {
  site?: string;
  instance?: LeverInstance;
  pageSize?: number;
  maxPages?: number;
  maxJobs?: number;
};

export type LeverMapFailure = {
  ok: false;
  reason: 'malformed_id' | 'missing_title' | 'invalid_job';
  externalId?: string;
};

export type LeverMapSuccess = {
  ok: true;
  job: NormalizedJobInput;
};

export type LeverMapResult = LeverMapSuccess | LeverMapFailure;

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;

export function inferLeverRemoteFromLocation(locationText: string | null | undefined): RemoteType {
  if (!locationText) return 'unknown';
  if (REMOTE_RE.test(locationText)) return 'remote';
  if (HYBRID_RE.test(locationText)) return 'hybrid';
  return 'unknown';
}

/**
 * Explicit Lever workplaceType wins. Location inference is only used
 * when the field is missing entirely. Description is never scanned.
 */
export function mapLeverWorkplaceType(
  workplaceType: string | null | undefined,
  locationText: string | null | undefined,
): RemoteType {
  if (workplaceType == null || workplaceType.trim() === '') {
    return inferLeverRemoteFromLocation(locationText);
  }
  switch (workplaceType.trim()) {
    case 'remote':
      return 'remote';
    case 'hybrid':
      return 'hybrid';
    case 'on-site':
      return 'onsite';
    case 'unspecified':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Conservative commitment labels only. Employer-specific phrases such as
 * "Employee India" stay unknown.
 */
export function mapLeverCommitment(value: string | null | undefined): EmploymentType {
  if (value == null || value.trim() === '') return 'unknown';
  const key = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = key.replace(/[\s-]/g, '');
  if (key === 'full time' || key === 'full-time' || compact === 'fulltime') return 'full_time';
  if (key === 'part time' || key === 'part-time' || compact === 'parttime') return 'part_time';
  if (key === 'contract' || key === 'contractor') return 'contract';
  if (key === 'freelance') return 'freelance';
  if (key === 'intern' || key === 'internship') return 'internship';
  if (key === 'temporary' || key === 'temp') return 'temporary';
  return 'unknown';
}

export function mapLeverSalaryPeriod(interval: string | null | undefined): SalaryPeriod {
  if (interval == null || interval.trim() === '') return 'unknown';
  const key = interval.trim().toLowerCase().replace(/[_]+/g, '-');
  if (/(^|-)(year|yearly|annual|annually)(-|$)/.test(key) || key.includes('per-year')) return 'year';
  if (/(^|-)(month|monthly)(-|$)/.test(key) || key.includes('per-month')) return 'month';
  if (/(^|-)(day|daily)(-|$)/.test(key) || key.includes('per-day')) return 'day';
  if (/(^|-)(hour|hourly)(-|$)/.test(key) || key.includes('per-hour')) return 'hour';
  return 'unknown';
}

export function mapLeverSalary(range: LeverJob['salaryRange']): SalaryInput | null {
  if (!range) return null;
  const min = range.min;
  const max = range.max;
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  const currency =
    typeof range.currency === 'string' && range.currency.trim()
      ? range.currency.trim().toUpperCase()
      : null;
  return {
    min,
    max,
    currency,
    period: mapLeverSalaryPeriod(range.interval),
  };
}

export function leverExternalId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

export function leverCountry(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function usefulLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function leverLocationText(job: LeverJob): string | null {
  const primary = usefulLocation(job.categories?.location);
  if (primary) return primary;
  const extras = (job.categories?.allLocations ?? [])
    .map(usefulLocation)
    .filter((name): name is string => Boolean(name));
  if (extras.length === 1) return extras[0] ?? null;
  return null;
}

function escapeHeading(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * description already includes opening + body. Append lists and additional
 * only. Do not re-append opening or descriptionBody.
 */
export function composeLeverDescriptionHtml(job: LeverJob): string | null {
  const parts: string[] = [];
  if (job.description?.trim()) parts.push(job.description.trim());
  for (const list of job.lists ?? []) {
    const heading = list.text?.trim();
    const content = list.content?.trim();
    if (!heading && !content) continue;
    if (heading) parts.push(`<h3>${escapeHeading(heading)}</h3>`);
    if (content) {
      parts.push(/<\s*(ul|ol)\b/i.test(content) ? content : `<ul>${content}</ul>`);
    }
  }
  if (job.additional?.trim()) parts.push(job.additional.trim());
  return parts.length > 0 ? parts.join('\n') : null;
}

export function leverRawPayload(job: LeverJob): Record<string, unknown> {
  return {
    id: job.id,
    categories: job.categories ?? null,
    country: job.country ?? null,
    workplaceType: job.workplaceType ?? null,
    salaryRange: job.salaryRange ?? null,
    salaryDescriptionPlain: job.salaryDescriptionPlain ?? null,
    openingPlain: job.openingPlain ?? null,
    descriptionPlain: job.descriptionPlain ?? null,
    descriptionBodyPlain: job.descriptionBodyPlain ?? null,
    additionalPlain: job.additionalPlain ?? null,
  };
}

export type MapLeverJobInput = {
  sourceId: string;
  companyName: string;
  companyId?: string;
  companyDomain?: string | null;
};

export function mapLeverJob(raw: unknown, input: MapLeverJobInput): LeverMapResult {
  const parsed = leverJobSchema.safeParse(raw);
  if (!parsed.success) {
    const maybeId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
    const externalId = leverExternalId(maybeId) ?? undefined;
    if (maybeId !== undefined && externalId == null) {
      return { ok: false, reason: 'malformed_id' };
    }
    return { ok: false, reason: 'invalid_job', externalId };
  }

  const job = parsed.data;
  const externalId = leverExternalId(job.id);
  if (!externalId) {
    return { ok: false, reason: 'malformed_id' };
  }

  const title = job.text?.trim() ?? '';
  if (!title) {
    return { ok: false, reason: 'missing_title', externalId };
  }

  const locationText = leverLocationText(job);
  const hostedUrl = job.hostedUrl?.trim() ?? '';
  const applyUrl = job.applyUrl?.trim() || hostedUrl;

  return {
    ok: true,
    job: {
      source: {
        sourceId: input.sourceId,
        externalId,
      },
      company: {
        companyId: input.companyId,
        name: input.companyName,
        domain: input.companyDomain,
      },
      title,
      location: {
        text: locationText,
        country: leverCountry(job.country),
      },
      remoteType: mapLeverWorkplaceType(job.workplaceType, locationText),
      employmentType: mapLeverCommitment(job.categories?.commitment),
      descriptionHtml: composeLeverDescriptionHtml(job),
      department: job.categories?.department?.trim() || null,
      team: job.categories?.team?.trim() || null,
      salary: mapLeverSalary(job.salaryRange),
      publishedAt: null,
      applyUrl,
      sourceUrl: hostedUrl,
      rawPayload: leverRawPayload(job),
    },
  };
}

function rejectionPlaceholder(context: JobSourceContext, failure: LeverMapFailure): NormalizedJobInput {
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
    title: failure.reason === 'missing_title' ? '' : 'Invalid Lever job',
    location: {},
    remoteType: 'unknown',
    employmentType: 'unknown',
    publishedAt: null,
    applyUrl: '',
    sourceUrl: '',
    rawPayload: { rejection: failure.reason },
  };
}

function resolveSite(context: JobSourceContext, configured?: string): string {
  const site = configured ?? context.externalIdentifier ?? '';
  if (!site.trim()) {
    throw new AdapterFetchError('Lever site identifier is missing on job_sources.external_identifier');
  }
  return assertLeverSite(site);
}

/**
 * Public Lever Postings API v0 adapter. Fetch + paginate + map only.
 * Site comes from job_sources.external_identifier. Instance is
 * metadata.lever_instance = global | eu. Never writes to Supabase.
 */
export class LeverAdapter implements JobSourceAdapter {
  readonly provider = 'lever' as const;

  constructor(private readonly options: LeverAdapterOptions = {}) {}

  async fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult> {
    const site = resolveSite(context, this.options.site);
    const instance = this.options.instance ?? resolveLeverInstance(context.metadata?.lever_instance);
    const pageSize = this.options.pageSize ?? LEVER_PAGE_SIZE;
    const maxPages = this.options.maxPages ?? LEVER_MAX_PAGES;
    const maxJobs = this.options.maxJobs ?? LEVER_MAX_JOBS;
    const started = Date.now();

    logJobEngine('lever_fetch_started', {
      sourceId: context.sourceId,
      site,
      instance,
    });

    const companyName = context.companyName ?? context.sourceName ?? 'Unknown company';
    const jobs: NormalizedJobInput[] = [];
    const seenIds = new Set<string>();
    let rejected = 0;
    let pages = 0;
    let requestCount = 0;
    let duplicateIds = 0;
    let snapshotComplete = false;
    let capped = false;

    let skip = 0;
    while (pages < maxPages && jobs.length < maxJobs) {
      const url = leverPostingsUrl(instance, site, skip, pageSize);
      const { body } = await fetchLeverJson(url, site, this.options);
      requestCount += 1;
      pages += 1;

      if (!Array.isArray(body)) {
        throw new AdapterFetchError(`Lever postings payload was not an array for site ${site}`);
      }

      for (const raw of body) {
        const maybeId =
          raw && typeof raw === 'object' ? leverExternalId((raw as { id?: unknown }).id) : null;
        if (maybeId && seenIds.has(maybeId)) {
          duplicateIds += 1;
          continue;
        }
        if (maybeId) seenIds.add(maybeId);

        const mapped = mapLeverJob(raw, {
          sourceId: context.sourceId,
          companyName,
          companyId: context.companyId ?? undefined,
          companyDomain: context.companyDomain,
        });
        if (mapped.ok) {
          jobs.push(mapped.job);
        } else {
          rejected += 1;
          jobs.push(rejectionPlaceholder(context, mapped));
        }

        if (jobs.length >= maxJobs && body.length >= pageSize) {
          capped = true;
          break;
        }
      }

      if (body.length < pageSize) {
        snapshotComplete = duplicateIds === 0 && !capped;
        break;
      }

      skip += pageSize;
      if (pages >= maxPages) {
        capped = true;
        break;
      }
    }

    if (capped) snapshotComplete = false;

    logJobEngine('lever_fetch_completed', {
      sourceId: context.sourceId,
      site,
      instance,
      fetched: jobs.length,
      accepted: jobs.length - rejected,
      rejected,
      pages,
      snapshotComplete,
      durationMs: Date.now() - started,
    });

    return {
      jobs,
      snapshotComplete,
      metadata: {
        pages,
        requestCount,
        instance,
        site,
        duplicateIds,
        capped,
        pageSize,
      },
    };
  }
}
