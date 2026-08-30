import 'server-only';

import type {
  AdapterFetchResult,
  JobSourceAdapter,
  JobSourceContext,
} from '@/lib/jobs/adapters/types';
import {
  assertGreenhouseBoardToken,
  fetchGreenhouseJson,
  greenhouseBoardUrl,
  greenhouseJobsUrl,
  type GreenhouseFetchOptions,
} from '@/lib/jobs/adapters/greenhouse-http';
import {
  greenhouseBoardSchema,
  greenhouseJobSchema,
  greenhouseJobsListSchema,
  type GreenhouseJob,
} from '@/lib/jobs/adapters/greenhouse-schema';
import { AdapterFetchError } from '@/lib/jobs/errors';
import { logJobEngine } from '@/lib/jobs/logging';
import type { NormalizedJobInput, RemoteType } from '@/lib/jobs/types';

export type GreenhouseAdapterOptions = GreenhouseFetchOptions & {
  boardToken?: string;
  fetchBoard?: boolean;
};

export type GreenhouseMapFailure = {
  ok: false;
  reason: 'malformed_id' | 'missing_title' | 'invalid_job';
  externalId?: string;
};

export type GreenhouseMapSuccess = {
  ok: true;
  job: NormalizedJobInput;
};

export type GreenhouseMapResult = GreenhouseMapSuccess | GreenhouseMapFailure;

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;

/**
 * Location-text only. Never scan the description. Never infer onsite
 * just because "remote" is absent — that stays unknown → NULL.
 */
export function inferGreenhouseRemoteType(locationText: string | null | undefined): RemoteType {
  if (!locationText) return 'unknown';
  if (REMOTE_RE.test(locationText)) return 'remote';
  if (HYBRID_RE.test(locationText)) return 'hybrid';
  return 'unknown';
}

/**
 * Decode fully-escaped Greenhouse HTML once. If real tags are already
 * present, leave the string alone so we do not double-decode markup.
 * Phase 3 sanitize-html is still the only sanitizer.
 */
export function decodeGreenhouseContent(content: string): string {
  const hasTags = /<[a-zA-Z][\s\S]*>/.test(content);
  const hasEscapedTags = /&lt;[a-zA-Z]/i.test(content);
  if (hasTags || !hasEscapedTags) return content;
  return decodeHtmlEntitiesOnce(content);
}

function decodeHtmlEntitiesOnce(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    switch (entity.toLowerCase()) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
      case '#39':
        return "'";
      case 'nbsp':
        return ' ';
      default:
        return match;
    }
  });
}

export function greenhouseExternalId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

function officeName(office: unknown): string | null {
  if (!office || typeof office !== 'object') return null;
  const name = (office as { name?: unknown }).name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function greenhouseLocationText(job: GreenhouseJob): string | null {
  const named = job.location?.name?.trim();
  if (named) return named;
  const offices = job.offices ?? [];
  for (const office of offices) {
    const name = officeName(office);
    if (name) return name;
  }
  return null;
}

export function greenhouseDepartment(job: GreenhouseJob): string | null {
  const names = (job.departments ?? [])
    .map((dept) => dept.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 1) return names[0] ?? null;
  if (names.length > 1) return names[0] ?? null;
  return null;
}

export function greenhouseRawPayload(job: GreenhouseJob): Record<string, unknown> {
  return {
    id: job.id,
    internal_job_id: job.internal_job_id ?? null,
    updated_at: job.updated_at ?? null,
    requisition_id: job.requisition_id ?? null,
    language: job.language ?? null,
    metadata: job.metadata ?? null,
    departments: job.departments ?? [],
    offices: job.offices ?? [],
  };
}

function rejectionPlaceholder(
  context: JobSourceContext,
  failure: GreenhouseMapFailure,
): NormalizedJobInput {
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
    title: failure.reason === 'missing_title' ? '' : 'Invalid Greenhouse job',
    location: {},
    remoteType: 'unknown',
    employmentType: 'unknown',
    publishedAt: null,
    applyUrl: '',
    sourceUrl: '',
    rawPayload: { rejection: failure.reason },
  };
}

export type MapGreenhouseJobInput = {
  sourceId: string;
  companyName: string;
  companyId?: string;
  companyDomain?: string | null;
};

export function mapGreenhouseJob(
  raw: unknown,
  input: MapGreenhouseJobInput,
): GreenhouseMapResult {
  const parsed = greenhouseJobSchema.safeParse(raw);
  if (!parsed.success) {
    const maybeId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
    const externalId = greenhouseExternalId(maybeId) ?? undefined;
    if (maybeId !== undefined && externalId == null) {
      return { ok: false, reason: 'malformed_id' };
    }
    return { ok: false, reason: 'invalid_job', externalId };
  }

  const job = parsed.data;
  const externalId = greenhouseExternalId(job.id);
  if (!externalId) {
    return { ok: false, reason: 'malformed_id' };
  }

  const title = job.title?.trim() ?? '';
  if (!title) {
    return { ok: false, reason: 'missing_title', externalId };
  }

  const locationText = greenhouseLocationText(job);
  const url = job.absolute_url?.trim() ?? '';
  const html = job.content ? decodeGreenhouseContent(job.content) : null;

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
      location: { text: locationText },
      remoteType: inferGreenhouseRemoteType(locationText),
      employmentType: 'unknown',
      descriptionHtml: html,
      department: greenhouseDepartment(job),
      publishedAt: null,
      applyUrl: url,
      sourceUrl: url,
      rawPayload: greenhouseRawPayload(job),
    },
  };
}

function resolveBoardToken(context: JobSourceContext, configured?: string): string {
  const token = configured ?? context.externalIdentifier ?? '';
  if (!token.trim()) {
    throw new AdapterFetchError('Greenhouse board token is missing on job_sources.external_identifier');
  }
  return assertGreenhouseBoardToken(token);
}

/**
 * Public Greenhouse Job Board API adapter. Fetch + map only.
 * Board token comes from job_sources.external_identifier (or test override).
 * Never writes to Supabase. Never sends credentials.
 */
export class GreenhouseAdapter implements JobSourceAdapter {
  readonly provider = 'greenhouse' as const;

  constructor(private readonly options: GreenhouseAdapterOptions = {}) {}

  async fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult> {
    const boardToken = resolveBoardToken(context, this.options.boardToken);
    const started = Date.now();
    logJobEngine('greenhouse_fetch_started', {
      sourceId: context.sourceId,
      boardToken,
    });

    const jobsUrl = greenhouseJobsUrl(boardToken);
    const { body } = await fetchGreenhouseJson(jobsUrl, boardToken, this.options);

    const list = greenhouseJobsListSchema.safeParse(body);
    if (!list.success) {
      throw new AdapterFetchError(`Greenhouse jobs payload failed validation for board ${boardToken}`);
    }

    const companyName = context.companyName ?? context.sourceName ?? 'Unknown company';
    const jobs: NormalizedJobInput[] = [];
    let rejected = 0;

    for (const raw of list.data.jobs) {
      const mapped = mapGreenhouseJob(raw, {
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
    }

    const metaTotal = list.data.meta?.total;
    const snapshotComplete = metaTotal == null || metaTotal === list.data.jobs.length;

    let boardName: string | null = null;
    if (this.options.fetchBoard !== false) {
      try {
        const board = await fetchGreenhouseJson(
          greenhouseBoardUrl(boardToken),
          boardToken,
          this.options,
        );
        const parsedBoard = greenhouseBoardSchema.safeParse(board.body);
        boardName = parsedBoard.success ? parsedBoard.data.name?.trim() || null : null;
      } catch {
        boardName = null;
      }
    }

    logJobEngine('greenhouse_fetch_completed', {
      sourceId: context.sourceId,
      boardToken,
      fetched: list.data.jobs.length,
      accepted: list.data.jobs.length - rejected,
      rejected,
      snapshotComplete,
      durationMs: Date.now() - started,
    });

    return {
      jobs,
      snapshotComplete,
      metadata: {
        pages: 1,
        requestCount: this.options.fetchBoard === false ? 1 : 2,
        boardToken,
        boardName,
        metaTotal: metaTotal ?? null,
        mappedRejected: rejected,
      },
    };
  }
}
