import { describe, expect, it } from 'vitest';

import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import { verifyOne } from '@/lib/jobs/sources/verify';

function source(patch: Partial<JobSourceRecord> = {}): JobSourceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    name: 'Acme',
    sourceType: 'greenhouse',
    externalIdentifier: 'acme',
    enabled: true,
    syncFrequencyMinutes: 60,
    lastSyncedAt: null,
    nextSyncAt: null,
    status: 'active',
    errorCount: 0,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers({ 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) });
  return new Response(JSON.stringify(body), { status, headers });
}

describe('verifyOne', () => {
  it('returns invalid for an unsupported provider without calling fetch', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyOne(source({ sourceType: 'workday' as never }), { fetchImpl });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('returns invalid for a malformed identifier without calling fetch', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyOne(source({ externalIdentifier: '../evil' }), { fetchImpl });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('returns verified with jobCount from a Greenhouse jobs body', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ jobs: [{ id: 1 }, { id: 2 }, { id: 3 }] })) as unknown as typeof fetch;
    const outcome = await verifyOne(source({ sourceType: 'greenhouse', externalIdentifier: 'acme' }), {
      fetchImpl,
    });
    expect(outcome).toEqual({ status: 'verified', jobCount: 3 });
  });

  it('returns empty when Greenhouse jobs body has zero rows', async () => {
    const fetchImpl = (async () => jsonResponse({ jobs: [] })) as unknown as typeof fetch;
    const outcome = await verifyOne(source(), { fetchImpl });
    expect(outcome).toEqual({ status: 'empty', jobCount: 0 });
  });

  it('returns invalid on HTTP 404', async () => {
    const fetchImpl = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const outcome = await verifyOne(source(), { fetchImpl });
    expect(outcome.status).toBe('invalid');
  });

  it('returns rate_limited on HTTP 429', async () => {
    const fetchImpl = (async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    const outcome = await verifyOne(source(), { fetchImpl });
    expect(outcome.status).toBe('rate_limited');
  });

  it('returns unreachable on a network error (does not mark invalid)', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const outcome = await verifyOne(source(), { fetchImpl });
    expect(outcome.status).toBe('unreachable');
  });

  it('returns parse_failed when Greenhouse content-type is not JSON', async () => {
    const fetchImpl = (async () =>
      new Response('<html/>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    const outcome = await verifyOne(source(), { fetchImpl });
    expect(outcome.status).toBe('parse_failed');
  });

  it('accepts Lever v0 postings array shape', async () => {
    const fetchImpl = (async () =>
      jsonResponse([{ id: 'x' }])) as unknown as typeof fetch;
    const outcome = await verifyOne(
      source({ sourceType: 'lever', externalIdentifier: 'drivetrain' }),
      { fetchImpl },
    );
    expect(outcome.status).toBe('verified');
  });

  it('accepts Ashby posting-api job-board shape', async () => {
    const fetchImpl = (async () => jsonResponse({ jobs: [{ id: 'x' }] })) as unknown as typeof fetch;
    const outcome = await verifyOne(source({ sourceType: 'ashby', externalIdentifier: 'zeeg' }), {
      fetchImpl,
    });
    expect(outcome.status).toBe('verified');
  });

  it('accepts WWR RSS with items', async () => {
    const rss = '<?xml version="1.0"?><rss><channel><item><title>a</title></item><item><title>b</title></item></channel></rss>';
    const fetchImpl = (async () =>
      new Response(rss, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      })) as unknown as typeof fetch;
    const outcome = await verifyOne(
      source({
        sourceType: 'we_work_remotely',
        externalIdentifier: 'weworkremotely-all',
        companyId: null,
      }),
      { fetchImpl },
    );
    expect(outcome).toEqual({ status: 'verified', jobCount: 2 });
  });
});
