import { describe, expect, it } from 'vitest';

import { verifyCandidate } from '@/lib/jobs/sources/verify';

/**
 * Candidate mode is the seed-eligibility gate. Zero database or storage
 * access — the CLI accepts a provider + identifier from the operator
 * and probes the provider host directly.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers({
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  });
  return new Response(JSON.stringify(body), { status, headers });
}

describe('verifyCandidate — ad-hoc provider probing', () => {
  it('verified: Greenhouse board with a non-empty jobs array', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return jsonResponse({ jobs: [{ id: 1 }, { id: 2 }] });
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'greenhouse', identifier: 'twilio', fetchImpl });
    expect(outcome).toEqual({ status: 'verified', jobCount: 2 });
    expect(seen[0]).toMatch(/^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/twilio\/jobs/);
  });

  it('verified: Lever site with an array response', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return jsonResponse([{ id: 'a' }]);
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'lever', identifier: 'gohighlevel', fetchImpl });
    expect(outcome.status).toBe('verified');
    expect(seen[0]).toMatch(/^https:\/\/api\.lever\.co\/v0\/postings\/gohighlevel/);
  });

  it('honours the lever_instance option for EU sites', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return jsonResponse([]);
    }) as unknown as typeof fetch;
    await verifyCandidate({
      provider: 'lever',
      identifier: 'somesite',
      leverInstance: 'eu',
      fetchImpl,
    });
    expect(seen[0]).toMatch(/^https:\/\/api\.eu\.lever\.co\//);
  });

  it('verified: Ashby board with a non-empty jobs array', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return jsonResponse({ jobs: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] });
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'ashby', identifier: 'ema', fetchImpl });
    expect(outcome).toEqual({ status: 'verified', jobCount: 3 });
    expect(seen[0]).toMatch(/^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/ema/);
  });

  it('empty: valid board with zero postings today is still seed-eligible', async () => {
    const fetchImpl = (async () => jsonResponse({ jobs: [] })) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'greenhouse', identifier: 'newco', fetchImpl });
    expect(outcome).toEqual({ status: 'empty', jobCount: 0 });
  });

  it('invalid: unknown provider is refused without any network call', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'workday', identifier: 'anything', fetchImpl });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('invalid: malformed identifier is refused without any network call', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({
      provider: 'greenhouse',
      identifier: '../etc/passwd',
      fetchImpl,
    });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('invalid: identifier containing a URL is refused without any network call', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({
      provider: 'lever',
      identifier: 'https://evil.example',
      fetchImpl,
    });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('invalid: identifier with encoded slashes cannot hijack the URL path', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({
      provider: 'ashby',
      identifier: 'foo%2Fbar',
      fetchImpl,
    });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('invalid: WWR candidate probing is refused (singleton aggregator)', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({
      provider: 'we_work_remotely',
      identifier: 'weworkremotely-all',
      fetchImpl,
    });
    expect(outcome.status).toBe('invalid');
    expect(called).toBe(0);
  });

  it('unreachable: network error is not classified as invalid', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'greenhouse', identifier: 'twilio', fetchImpl });
    expect(outcome.status).toBe('unreachable');
  });

  it('rate_limited: 429 is classified separately from invalid', async () => {
    const fetchImpl = (async () => new Response('slow', { status: 429 })) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'lever', identifier: 'cprime', fetchImpl });
    expect(outcome.status).toBe('rate_limited');
  });

  it('invalid: HTTP 404 from the provider means the identifier does not exist', async () => {
    const fetchImpl = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'ashby', identifier: 'not-a-board', fetchImpl });
    expect(outcome.status).toBe('invalid');
  });

  it('parse_failed: provider returned the wrong content-type', async () => {
    const fetchImpl = (async () =>
      new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    const outcome = await verifyCandidate({ provider: 'greenhouse', identifier: 'twilio', fetchImpl });
    expect(outcome.status).toBe('parse_failed');
  });
});
