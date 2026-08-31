import { XMLParser } from 'fast-xml-parser';

import { AdapterFetchError } from '@/lib/jobs/errors';

const DANGEROUS_XML = /<!DOCTYPE/i;

export type WwrParsedItem = {
  title: unknown;
  link: unknown;
  guid: unknown;
  description: unknown;
  pubDate: unknown;
  region: unknown;
  country: unknown;
  state: unknown;
  skills: unknown;
  category: unknown;
  type: unknown;
  expires_at: unknown;
};

export type WwrParsedFeed = {
  items: WwrParsedItem[];
  channelTitle: string | null;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse WWR RSS. External entities / DOCTYPE are rejected before parse.
 * processEntities is disabled so the parser does not expand XXE.
 */
export function parseWwrRssXml(xml: string): WwrParsedFeed {
  if (!xml.trim()) {
    throw new AdapterFetchError('WWR RSS body was empty');
  }
  if (DANGEROUS_XML.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new AdapterFetchError('WWR RSS contained a disallowed DOCTYPE or entity');
  }

  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
      trimValues: false,
      parseTagValue: false,
      isArray: (name) => name === 'item',
    });
    parsed = parser.parse(xml);
  } catch {
    throw new AdapterFetchError('WWR RSS was not valid XML');
  }

  const root = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const rss = root?.rss && typeof root.rss === 'object' ? (root.rss as Record<string, unknown>) : null;
  const channel = rss?.channel && typeof rss.channel === 'object' ? (rss.channel as Record<string, unknown>) : null;
  if (!channel) {
    throw new AdapterFetchError('WWR RSS channel was missing');
  }

  const items = asArray(channel.item) as WwrParsedItem[];
  const channelTitle = typeof channel.title === 'string' ? channel.title : null;
  return { items, channelTitle };
}

export function xmlText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('#text' in record) return xmlText(record['#text']);
  }
  return null;
}

export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
