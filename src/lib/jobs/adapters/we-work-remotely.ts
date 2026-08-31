import 'server-only';

import type {
  AdapterFetchResult,
  JobSourceAdapter,
  JobSourceContext,
} from '@/lib/jobs/adapters/types';
import {
  WWR_MAX_JOBS,
  WWR_RSS_URL,
  fetchWwrRss,
  type WwrFetchOptions,
} from '@/lib/jobs/adapters/wwr-http';
import { decodeBasicEntities, parseWwrRssXml, xmlText, type WwrParsedItem } from '@/lib/jobs/adapters/wwr-xml';
import { logJobEngine } from '@/lib/jobs/logging';
import { decodeSafeXmlText } from '@/lib/jobs/normalization/decode-xml-text';
import { isSafeHttpUrl } from '@/lib/jobs/normalization/normalize-urls';
import type { EmploymentType, NormalizedJobInput } from '@/lib/jobs/types';

export type WwrAdapterOptions = WwrFetchOptions & {
  maxJobs?: number;
};

export type WwrMapFailure = {
  ok: false;
  reason: 'malformed_id' | 'missing_title' | 'missing_company' | 'invalid_job';
  externalId?: string;
};

export type WwrMapSuccess = {
  ok: true;
  job: NormalizedJobInput;
};

export type WwrMapResult = WwrMapSuccess | WwrMapFailure;

const NON_COUNTRY = new Set([
  'worldwide',
  'anywhere',
  'anywhere in the world',
  'the world',
  'global',
  'europe',
  'european union',
  'eu',
  'emea',
  'apac',
  'asia',
  'africa',
  'latin america',
  'north america',
  'south america',
  'middle east',
  'oceania',
]);

export function splitWwrTitle(raw: string | null | undefined): { company: string; title: string } | null {
  if (raw == null) return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const index = trimmed.indexOf(':');
  if (index <= 0) return null;
  const company = trimmed.slice(0, index).trim();
  const title = trimmed.slice(index + 1).trim();
  if (!company || !title) return null;
  return { company, title };
}

export function isWwrListingUrl(value: string | null | undefined): boolean {
  if (!value || !isSafeHttpUrl(value)) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'weworkremotely.com') return false;
    return /^\/remote-jobs\/[a-z0-9][a-z0-9-]*$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function wwrExternalId(guid: unknown, link: unknown): string | null {
  const fromGuid = xmlText(guid)?.trim();
  if (fromGuid) return fromGuid;
  const fromLink = xmlText(link)?.trim();
  if (fromLink && isWwrListingUrl(fromLink)) return fromLink;
  return null;
}

export function parseWwrPublishedAt(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const trimmed = value.trim();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

export function mapWwrEmploymentType(value: string | null | undefined): EmploymentType {
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

function usefulText(value: unknown): string | null {
  const text = xmlText(value)?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

/** RSS plain-text fields. Description HTML must not use this path. */
function usefulPlainText(value: unknown): string | null {
  const raw = xmlText(value);
  if (raw == null) return null;
  const text = decodeSafeXmlText(raw).replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

const COUNTRY_MAX_LEN = 80;

/**
 * WWR `<country>` is often a restriction/exclusion blob, not one country.
 * Only accept a value that can plausibly be a single country name.
 */
export function isWwrCountry(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length > COUNTRY_MAX_LEN) return false;
  if (NON_COUNTRY.has(trimmed.toLowerCase())) return false;
  if (/[,;/|]/.test(trimmed)) return false;
  if (/\b(except|excluding|including)\b/i.test(trimmed)) return false;
  return true;
}

export function wwrLocation(item: WwrParsedItem): {
  text: string | null;
  country: string | null;
  region: string | null;
} {
  const regionRaw = usefulPlainText(item.region);
  const countryRaw = usefulPlainText(item.country);
  const state = usefulPlainText(item.state);
  const country = countryRaw && isWwrCountry(countryRaw) ? countryRaw : null;
  const region = regionRaw && regionRaw.length <= 120 ? regionRaw : null;
  const textCandidate = regionRaw ?? country ?? state;
  const text = textCandidate && textCandidate.length <= 400 ? textCandidate : null;
  return { text, country, region };
}

export function wwrRawPayload(item: WwrParsedItem, extra: { guid: string | null }): Record<string, unknown> {
  return {
    guid: extra.guid,
    region: usefulPlainText(item.region),
    country: usefulPlainText(item.country),
    state: usefulPlainText(item.state),
    category: usefulPlainText(item.category),
    type: usefulPlainText(item.type),
    skills: usefulPlainText(item.skills),
    pubDate: usefulText(item.pubDate),
    expires_at: usefulText(item.expires_at),
  };
}

export type MapWwrJobInput = {
  sourceId: string;
};

export function mapWwrItem(raw: WwrParsedItem, input: MapWwrJobInput): WwrMapResult {
  const externalId = wwrExternalId(raw.guid, raw.link);
  if (!externalId) {
    return { ok: false, reason: 'malformed_id' };
  }

  const parsedTitle = splitWwrTitle(usefulPlainText(raw.title));
  if (!parsedTitle) {
    return { ok: false, reason: 'missing_company', externalId };
  }

  const listingUrl = [usefulText(raw.link), usefulText(raw.guid)].find((value) => isWwrListingUrl(value));
  if (!listingUrl) {
    return { ok: false, reason: 'invalid_job', externalId };
  }

  const descriptionRaw = usefulText(raw.description);
  const descriptionHtml = descriptionRaw ? decodeBasicEntities(descriptionRaw) : null;
  const location = wwrLocation(raw);

  return {
    ok: true,
    job: {
      source: {
        sourceId: input.sourceId,
        externalId,
      },
      company: {
        name: parsedTitle.company,
      },
      title: parsedTitle.title,
      location,
      remoteType: 'remote',
      employmentType: mapWwrEmploymentType(usefulPlainText(raw.type)),
      descriptionHtml,
      department: usefulPlainText(raw.category),
      publishedAt: parseWwrPublishedAt(usefulText(raw.pubDate)),
      applyUrl: listingUrl,
      sourceUrl: listingUrl,
      rawPayload: wwrRawPayload(raw, { guid: usefulText(raw.guid) }),
    },
  };
}

function rejectionPlaceholder(context: JobSourceContext, failure: WwrMapFailure): NormalizedJobInput {
  return {
    source: {
      sourceId: context.sourceId,
      externalId: failure.externalId ?? '',
    },
    company: {
      name: 'Rejected listing',
    },
    title: failure.reason === 'missing_company' ? '' : 'Invalid WWR job',
    location: {},
    remoteType: 'remote',
    employmentType: 'unknown',
    publishedAt: null,
    applyUrl: '',
    sourceUrl: '',
    rawPayload: { rejection: failure.reason },
  };
}

/**
 * Official We Work Remotely all-jobs RSS adapter. Fetch + parse + map only.
 * WWR is a publisher. Each item supplies its own employer name.
 * The feed is not treated as a complete active snapshot.
 */
export class WwrAdapter implements JobSourceAdapter {
  readonly provider = 'we_work_remotely' as const;

  constructor(private readonly options: WwrAdapterOptions = {}) {}

  async fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult> {
    const maxJobs = this.options.maxJobs ?? WWR_MAX_JOBS;
    const started = Date.now();

    logJobEngine('wwr_fetch_started', {
      sourceId: context.sourceId,
      feed: WWR_RSS_URL,
    });

    const { body, bytes } = await fetchWwrRss(this.options);
    const feed = parseWwrRssXml(body);
    const capped = feed.items.length > maxJobs;
    const slice = capped ? feed.items.slice(0, maxJobs) : feed.items;

    const jobs: NormalizedJobInput[] = [];
    const seenIds = new Set<string>();
    let rejected = 0;
    let duplicateGuids = 0;
    let publishedDates = 0;

    for (const raw of slice) {
      const mapped = mapWwrItem(raw, { sourceId: context.sourceId });
      if (mapped.ok) {
        if (seenIds.has(mapped.job.source.externalId)) {
          duplicateGuids += 1;
          continue;
        }
        seenIds.add(mapped.job.source.externalId);
        if (mapped.job.publishedAt) publishedDates += 1;
        jobs.push(mapped.job);
      } else {
        rejected += 1;
        jobs.push(rejectionPlaceholder(context, mapped));
      }
    }

    // Live evidence: RSS item count is lower than the public board listing
    // count, so disappearance from RSS must not close canonical jobs.
    const snapshotComplete = false;

    logJobEngine('wwr_fetch_completed', {
      sourceId: context.sourceId,
      fetched: feed.items.length,
      accepted: jobs.length - rejected,
      rejected,
      duplicateGuids,
      bytes,
      snapshotComplete,
      durationMs: Date.now() - started,
    });

    return {
      jobs,
      snapshotComplete,
      metadata: {
        requestCount: 1,
        pages: 1,
        feed: WWR_RSS_URL,
        format: 'rss',
        fetched: feed.items.length,
        rejected,
        duplicateGuids,
        publishedDates,
        bytes,
        capped,
        channelTitle: feed.channelTitle,
      },
    };
  }
}
