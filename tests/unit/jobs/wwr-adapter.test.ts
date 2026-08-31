import { describe, expect, it } from 'vitest';

import { WwrAdapter } from '@/lib/jobs/adapters/we-work-remotely';
import { parseWwrRssXml } from '@/lib/jobs/adapters/wwr-xml';
import { AdapterFetchError } from '@/lib/jobs/errors';

import { WWR_SOURCE_ID, mockWwrFetch, wwrItemXml, wwrRssXml } from './fixtures/wwr-jobs';

const CONTEXT = {
  sourceId: WWR_SOURCE_ID,
  sourceName: 'We Work Remotely',
  externalIdentifier: 'weworkremotely-all',
};

describe('WWR adapter RSS', () => {
  it('parses multiple items and a singleton item', async () => {
    const many = new WwrAdapter({
      fetchImpl: mockWwrFetch(
        wwrRssXml([
          wwrItemXml({ title: 'Alpha: Engineer', guid: 'https://weworkremotely.com/remote-jobs/alpha-engineer' }),
          wwrItemXml({ title: 'Beta: Designer', guid: 'https://weworkremotely.com/remote-jobs/beta-designer' }),
        ]),
      ),
    });
    const manyResult = await many.fetchJobs(CONTEXT);
    expect(manyResult.jobs).toHaveLength(2);
    expect(manyResult.snapshotComplete).toBe(false);

    const one = parseWwrRssXml(wwrRssXml([wwrItemXml()]));
    expect(one.items).toHaveLength(1);
  });

  it('rejects invalid XML, missing channel, and DOCTYPE', () => {
    expect(() => parseWwrRssXml('<not-xml')).toThrow(AdapterFetchError);
    expect(() => parseWwrRssXml('<rss></rss>')).toThrow(/channel/i);
    expect(() => parseWwrRssXml(wwrRssXml([wwrItemXml()], { doctype: true }))).toThrow(/DOCTYPE|entity/i);
  });

  it('dedupes duplicate GUIDs in one feed', async () => {
    const adapter = new WwrAdapter({
      fetchImpl: mockWwrFetch(
        wwrRssXml([
          wwrItemXml({ title: 'Acme: One' }),
          wwrItemXml({ title: 'Acme: One copy' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(1);
    expect(result.metadata?.duplicateGuids).toBe(1);
  });

  it('fails when the RSS body exceeds the size cap', async () => {
    const adapter = new WwrAdapter({
      fetchImpl: async () =>
        new Response('too-big', {
          status: 200,
          headers: {
            'content-type': 'application/rss+xml',
            'content-length': String(8 * 1024 * 1024 + 10),
          },
        }),
    });
    await expect(adapter.fetchJobs(CONTEXT)).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('throws on HTTP 404 instead of an empty complete snapshot', async () => {
    const adapter = new WwrAdapter({
      fetchImpl: mockWwrFetch('missing', { status: 404 }),
    });
    await expect(adapter.fetchJobs(CONTEXT)).rejects.toBeInstanceOf(AdapterFetchError);
  });

  it('marks a job-cap truncation without claiming completeness', async () => {
    const adapter = new WwrAdapter({
      maxJobs: 1,
      fetchImpl: mockWwrFetch(
        wwrRssXml([
          wwrItemXml({ title: 'Alpha: One', guid: 'https://weworkremotely.com/remote-jobs/alpha-one' }),
          wwrItemXml({ title: 'Beta: Two', guid: 'https://weworkremotely.com/remote-jobs/beta-two' }),
        ]),
      ),
    });
    const result = await adapter.fetchJobs(CONTEXT);
    expect(result.jobs).toHaveLength(1);
    expect(result.snapshotComplete).toBe(false);
    expect(result.metadata?.capped).toBe(true);
  });

  it('does not send credentials', async () => {
    let headers: HeadersInit | undefined;
    const adapter = new WwrAdapter({
      fetchImpl: async (_input, init) => {
        headers = init?.headers;
        return new Response(wwrRssXml([wwrItemXml()]), {
          status: 200,
          headers: { 'content-type': 'application/rss+xml' },
        });
      },
    });
    await adapter.fetchJobs(CONTEXT);
    const serialized = JSON.stringify(headers ?? {});
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/supabase/i);
  });
});
