import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import type { JobSourceProvider } from '@/lib/jobs/types';
import { WWR_SOURCE_IDENTIFIER } from '@/lib/jobs/adapters/wwr-http';

/**
 * Registry contract shared by the verify + sync CLIs.
 *
 * `job_sources` (0001) is the authoritative registry. Every field the
 * orchestrator relies on already exists there — provider (`source_type`),
 * canonical company binding (`company_id`), provider identifier
 * (`external_identifier`), enable/disable (`enabled`), health signals
 * (`status`, `error_count`, `last_synced_at`, `next_sync_at`). We do
 * NOT introduce a second JSON registry.
 *
 * This module contains only static validation of registry rows — the
 * verify CLI performs network probes, and the sync CLI delegates to the
 * existing sync engine.
 */

/** Providers currently supported by installed adapters. */
export const SUPPORTED_PROVIDERS = [
  'greenhouse',
  'lever',
  'ashby',
  'we_work_remotely',
] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: unknown): value is SupportedProvider {
  return typeof value === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Provider-specific identifier grammars. These MUST match the adapter
 * validators so a source that verifies here is guaranteed to be usable
 * by the adapter without further sanitization.
 */
export const GREENHOUSE_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export const LEVER_SITE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export const ASHBY_BOARD_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
/**
 * WWR singleton identifier. Re-exported from the adapter's HTTP module
 * (`WWR_SOURCE_IDENTIFIER = 'weworkremotely-all'` — see 0009) so the
 * validator, the CLI, and the adapter share **one** canonical constant.
 * Do not introduce a second WWR string.
 */
export const WWR_ALL_JOBS_IDENTIFIER: typeof WWR_SOURCE_IDENTIFIER = WWR_SOURCE_IDENTIFIER;

export type SourceConfigIssue =
  | 'unsupported_provider'
  | 'missing_identifier'
  | 'invalid_identifier'
  | 'missing_company_binding'
  | 'wwr_company_must_be_null'
  | 'wwr_identifier_must_be_singleton';

export type SourceConfigValidation =
  | { valid: true; provider: SupportedProvider; identifier: string }
  | { valid: false; issue: SourceConfigIssue; message: string };

/**
 * Pure validation — never touches the network, never mutates state.
 * Called before any adapter is constructed to keep bad rows from ever
 * reaching the provider host.
 */
export function validateSourceConfig(source: JobSourceRecord): SourceConfigValidation {
  const provider = source.sourceType as JobSourceProvider;
  if (!isSupportedProvider(provider)) {
    return {
      valid: false,
      issue: 'unsupported_provider',
      message: `Unsupported provider: ${String(source.sourceType)}`,
    };
  }
  const identifier = (source.externalIdentifier ?? '').trim();
  if (identifier.length === 0) {
    return {
      valid: false,
      issue: 'missing_identifier',
      message: 'external_identifier is required',
    };
  }
  if (provider === 'we_work_remotely') {
    if (source.companyId != null) {
      return {
        valid: false,
        issue: 'wwr_company_must_be_null',
        message: 'WWR is an aggregator; company_id must be NULL at the source level',
      };
    }
    if (identifier !== WWR_ALL_JOBS_IDENTIFIER) {
      return {
        valid: false,
        issue: 'wwr_identifier_must_be_singleton',
        message: `WWR uses a single global source identifier ("${WWR_ALL_JOBS_IDENTIFIER}")`,
      };
    }
    return { valid: true, provider, identifier };
  }
  if (source.companyId == null) {
    return {
      valid: false,
      issue: 'missing_company_binding',
      message: 'Direct-employer sources must bind to a canonical company via company_id',
    };
  }
  const re = identifierRegexFor(provider);
  if (!re.test(identifier)) {
    return {
      valid: false,
      issue: 'invalid_identifier',
      message: `Identifier "${identifier}" does not match ${provider} grammar`,
    };
  }
  return { valid: true, provider, identifier };
}

function identifierRegexFor(provider: SupportedProvider): RegExp {
  switch (provider) {
    case 'greenhouse':
      return GREENHOUSE_TOKEN_RE;
    case 'lever':
      return LEVER_SITE_RE;
    case 'ashby':
      return ASHBY_BOARD_RE;
    case 'we_work_remotely':
      return /.*/;
  }
}

/** All duplicate rows are reported together — the orchestrator refuses to run
 *  a registry containing two sources for the same provider identifier. */
export function findDuplicateSources(sources: readonly JobSourceRecord[]): {
  provider: SupportedProvider;
  identifier: string;
  ids: string[];
}[] {
  const groups = new Map<string, { provider: SupportedProvider; identifier: string; ids: string[] }>();
  for (const s of sources) {
    if (!isSupportedProvider(s.sourceType as string)) continue;
    const identifier = (s.externalIdentifier ?? '').trim();
    if (!identifier) continue;
    const key = `${s.sourceType}::${identifier.toLowerCase()}`;
    const entry = groups.get(key);
    if (entry) entry.ids.push(s.id);
    else groups.set(key, { provider: s.sourceType as SupportedProvider, identifier, ids: [s.id] });
  }
  return [...groups.values()].filter((row) => row.ids.length > 1);
}
