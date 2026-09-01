import type { JobSourceRecord } from '@/lib/jobs/repository/types';

import { ASHBY_API_ORIGIN } from '@/lib/jobs/adapters/ashby-http';
import { GREENHOUSE_API_ORIGIN } from '@/lib/jobs/adapters/greenhouse-http';
import { LEVER_API_ORIGINS, resolveLeverInstance } from '@/lib/jobs/adapters/lever-http';
import { WWR_ORIGIN } from '@/lib/jobs/adapters/wwr-http';
import {
  WWR_ALL_JOBS_IDENTIFIER,
  isSupportedProvider,
  validateSourceConfig,
  type SupportedProvider,
} from '@/lib/jobs/sources/registry';

/**
 * Read-only source verification.
 *
 * The verify CLI must never mutate the database or write to storage — it
 * only probes provider endpoints to confirm that a registered source is
 * still reachable, parses, and appears to be a valid job board. Rows are
 * NEVER modified from a verify run. Operators use the report to decide
 * what to fix.
 */

export type VerifyOutcome =
  | { status: 'verified'; jobCount: number | null; note?: string }
  | { status: 'empty'; jobCount: 0; note?: string }
  | { status: 'unreachable'; reason: string }
  | { status: 'rate_limited'; reason: string }
  | { status: 'invalid'; reason: string }
  | { status: 'parse_failed'; reason: string };

export type VerifyResult = {
  source: JobSourceRecord;
  outcome: VerifyOutcome;
};

const VERIFY_TIMEOUT_MS = 12_000;

type FetchImpl = typeof fetch;

/**
 * `verifyRegistry` runs one probe per source, sequentially by default.
 * Callers may pass a bounded worker pool if they want concurrency —
 * we do not fan out inside this function because verify is admin-only
 * and predictability matters more than throughput here.
 */
export async function verifyRegistry(
  sources: readonly JobSourceRecord[],
  options: { fetchImpl?: FetchImpl } = {},
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (const source of sources) {
    const outcome = await verifyOne(source, options);
    results.push({ source, outcome });
  }
  return results;
}

export async function verifyOne(
  source: JobSourceRecord,
  options: { fetchImpl?: FetchImpl } = {},
): Promise<VerifyOutcome> {
  const validation = validateSourceConfig(source);
  if (!validation.valid) {
    return { status: 'invalid', reason: validation.message };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = verificationUrlFor(validation.provider, validation.identifier, source);
  if (!url) {
    return { status: 'invalid', reason: 'Provider verification URL could not be built' };
  }
  return probeProvider(validation.provider, url, fetchImpl);
}

/**
 * Candidate verification. No DB row is created or required — the CLI hands
 * us a provider + identifier from operator input, we build a synthetic
 * JobSourceRecord that satisfies `validateSourceConfig`, and probe the
 * provider host exactly as we would for a stored source. Zero database
 * reads. Zero database writes. Zero storage writes.
 *
 * WWR is intentionally excluded from candidate probing — the aggregator
 * is a singleton and already stored via 0009. Any other value produces
 * `invalid`.
 */
export async function verifyCandidate(input: {
  provider: string;
  identifier: string;
  leverInstance?: 'global' | 'eu';
  fetchImpl?: FetchImpl;
}): Promise<VerifyOutcome> {
  if (!isSupportedProvider(input.provider)) {
    return { status: 'invalid', reason: `Unsupported provider: ${input.provider}` };
  }
  if (input.provider === 'we_work_remotely') {
    return {
      status: 'invalid',
      reason: 'WWR is a singleton aggregator; candidate probing is not supported.',
    };
  }
  const synthetic: JobSourceRecord = {
    id: '00000000-0000-4000-8000-000000000000',
    // Direct sources need a company binding to pass config validation. The
    // sentinel UUID is never persisted — verifyOne only reads it via the
    // config validator and then via verificationUrlFor which does not use it.
    companyId: '00000000-0000-4000-8000-000000000001',
    name: `candidate: ${input.provider} ${input.identifier}`,
    sourceType: input.provider,
    externalIdentifier: input.identifier.trim(),
    enabled: true,
    syncFrequencyMinutes: 60,
    lastSyncedAt: null,
    nextSyncAt: null,
    status: 'active',
    errorCount: 0,
    metadata:
      input.provider === 'lever' && input.leverInstance
        ? { lever_instance: input.leverInstance }
        : {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  // Guard: never let a candidate identifier that looks like the WWR
  // singleton hijack a non-WWR probe.
  if (synthetic.externalIdentifier === WWR_ALL_JOBS_IDENTIFIER) {
    return { status: 'invalid', reason: 'WWR singleton identifier is reserved.' };
  }
  return verifyOne(synthetic, { fetchImpl: input.fetchImpl });
}

function verificationUrlFor(
  provider: SupportedProvider,
  identifier: string,
  source: JobSourceRecord,
): string | null {
  try {
    switch (provider) {
      case 'greenhouse':
        // Same jobs endpoint the adapter uses at sync time, minus content=true
        // — we only need the shape and count.
        return `${GREENHOUSE_API_ORIGIN}/v1/boards/${encodeURIComponent(identifier)}/jobs`;
      case 'lever': {
        const instance = resolveLeverInstance(
          (source.metadata as { lever_instance?: unknown } | null)?.lever_instance,
        );
        return `${LEVER_API_ORIGINS[instance]}/v0/postings/${encodeURIComponent(identifier)}?mode=json&skip=0&limit=1`;
      }
      case 'ashby':
        return `${ASHBY_API_ORIGIN}/posting-api/job-board/${encodeURIComponent(identifier)}`;
      case 'we_work_remotely':
        return `${WWR_ORIGIN}/remote-jobs.rss`;
    }
  } catch {
    return null;
  }
}

async function probeProvider(
  provider: SupportedProvider,
  url: string,
  fetchImpl: FetchImpl,
): Promise<VerifyOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept:
          provider === 'we_work_remotely'
            ? 'application/rss+xml, application/xml;q=0.9, */*;q=0.1'
            : 'application/json',
        'User-Agent': `MyNextJob/0.1 (${provider} source verification)`,
      },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    return { status: 'unreachable', reason: message };
  }

  if (response.status === 429 || response.status === 503) {
    return { status: 'rate_limited', reason: `HTTP ${response.status}` };
  }
  if (response.status === 404) {
    return { status: 'invalid', reason: 'HTTP 404 — provider does not recognize this identifier' };
  }
  if (!response.ok) {
    // 4xx not in the known-invalid set OR any 5xx: treat as unreachable so
    // orchestration does not mark them "invalid" and prompt manual deletion.
    return { status: 'unreachable', reason: `HTTP ${response.status}` };
  }

  return parseProbeBody(provider, response);
}

async function parseProbeBody(
  provider: SupportedProvider,
  response: Response,
): Promise<VerifyOutcome> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (provider === 'we_work_remotely') {
      if (!/xml|rss/.test(contentType)) {
        return { status: 'parse_failed', reason: `Unexpected content-type: ${contentType}` };
      }
      const text = await response.text();
      if (!/<rss[\s>]/i.test(text)) {
        return { status: 'parse_failed', reason: 'Response does not look like RSS' };
      }
      const items = (text.match(/<item[\s>]/gi) ?? []).length;
      if (items === 0) return { status: 'empty', jobCount: 0 };
      return { status: 'verified', jobCount: items };
    }
    if (!contentType.includes('application/json') && !contentType.includes('+json')) {
      return { status: 'parse_failed', reason: `Unexpected content-type: ${contentType}` };
    }
    const body = (await response.json()) as unknown;
    const count = countProviderJobs(provider, body);
    if (count === null) {
      return { status: 'parse_failed', reason: 'Response did not match expected board shape' };
    }
    if (count === 0) return { status: 'empty', jobCount: 0 };
    return { status: 'verified', jobCount: count };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'parse error';
    return { status: 'parse_failed', reason: message };
  }
}

function countProviderJobs(provider: SupportedProvider, body: unknown): number | null {
  if (body == null || typeof body !== 'object') return null;
  const asRecord = body as Record<string, unknown>;
  switch (provider) {
    case 'greenhouse': {
      const jobs = asRecord.jobs;
      if (!Array.isArray(jobs)) return null;
      return jobs.length;
    }
    case 'lever': {
      if (!Array.isArray(body)) return null;
      return body.length;
    }
    case 'ashby': {
      const jobs = asRecord.jobs;
      if (!Array.isArray(jobs)) return null;
      return jobs.length;
    }
    case 'we_work_remotely':
      return null; // handled by RSS text path
  }
}
