import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompanyAssetRow } from '@/lib/companies/assets/store';
import { resolveCompanyAsset } from '@/lib/companies/assets/resolve';
import {
  mapPool,
  parseCompanyAssetsArgs,
  runCompanyAssetPipeline,
} from '@/lib/companies/assets/run';
import { rasterPng } from './image-fixtures';
import type { DnsLookupFn } from '@/lib/companies/assets/ssrf';

const COMPANY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const publicLookup: DnsLookupFn = async () => [{ address: '1.1.1.1', family: 4 }];

function company(overrides: Partial<CompanyAssetRow> = {}): CompanyAssetRow {
  return {
    id: COMPANY_ID,
    name: 'Drivetrain',
    domain: 'drivetrain.ai',
    logoStatus: 'pending',
    logoStoragePath: null,
    logoUpdatedAt: null,
    logoCheckedAt: null,
    ...overrides,
  };
}

function writeTrackingClient() {
  const writes: unknown[] = [];
  const client = {
    from: () => ({
      update: (patch: unknown) => {
        writes.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Buffer) => {
          writes.push({ path, bytes: bytes.length });
          return { error: null };
        },
        list: async () => ({ data: [{ name: 'logo.webp' }], error: null }),
      }),
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}

describe('companies:assets CLI', () => {
  it('defaults to dry-run', () => {
    const options = parseCompanyAssetsArgs([]);
    expect(options.apply).toBe(false);
    expect(options.force).toBe(false);
  });

  it('does not write during dry-run', async () => {
    const { client, writes } = writeTrackingClient();
    const fetchImpl = vi.fn();
    await runCompanyAssetPipeline(
      client,
      { apply: false, force: false, retryFailed: false, limit: 10, concurrency: 4 },
      {
        list: async () => [company(), company({ id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', domain: null, name: 'Toptal' })],
        deps: { lookup: publicLookup, fetchImpl },
      },
    );
    expect(writes).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips a ready company unless --force', async () => {
    const { client, writes } = writeTrackingClient();
    const ready = company({
      logoStatus: 'ready',
      logoStoragePath: `companies/${COMPANY_ID}/logo.webp`,
    });
    const results = await runCompanyAssetPipeline(
      client,
      { apply: true, force: false, retryFailed: false, limit: 10, concurrency: 2 },
      { list: async () => [ready] },
    );
    expect(results[0]?.outcome.status).toBe('skipped');
    expect(writes).toHaveLength(0);
  });

  it('marks domain-null companies unresolved', async () => {
    const { client, writes } = writeTrackingClient();
    const results = await runCompanyAssetPipeline(
      client,
      { apply: true, force: false, retryFailed: false, limit: 10, concurrency: 2 },
      { list: async () => [company({ domain: null, name: 'Toptal' })] },
    );
    expect(results[0]?.outcome).toMatchObject({ status: 'unresolved' });
    expect(writes[0]).toMatchObject({ logo_status: 'unresolved', logo_storage_path: null });
  });

  it('marks network failure as failed', async () => {
    const { client, writes } = writeTrackingClient();
    const results = await runCompanyAssetPipeline(
      client,
      { apply: true, force: false, retryFailed: false, limit: 10, concurrency: 2 },
      {
        list: async () => [company()],
        deps: {
          lookup: publicLookup,
          fetchImpl: async () => {
            throw new Error('ECONNRESET');
          },
        },
      },
    );
    expect(results[0]?.outcome.status).toBe('failed');
    expect(writes[0]).toMatchObject({ logo_status: 'failed' });
  });

  it('normalizes, uploads, and marks ready on success', async () => {
    const png = await rasterPng(64, 64);
    const { client, writes } = writeTrackingClient();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === 'https://drivetrain.ai/') {
        return new Response('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url.endsWith('/apple-touch-icon.png')) {
        return new Response(Uint8Array.from(png), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      return new Response('missing', { status: 404 });
    };
    const results = await runCompanyAssetPipeline(
      client,
      { apply: true, force: false, retryFailed: false, limit: 10, concurrency: 2 },
      { list: async () => [company()], deps: { lookup: publicLookup, fetchImpl } },
    );
    expect(results[0]?.outcome.status).toBe('ready');
    if (results[0]?.outcome.status === 'ready') {
      expect(results[0].outcome.storagePath).toBe(`companies/${COMPANY_ID}/logo.webp`);
      expect(results[0].outcome.bytes).toBeGreaterThan(0);
    }
    expect(writes.some((row) => row && typeof row === 'object' && 'logo_status' in row && row.logo_status === 'ready')).toBe(
      true,
    );
  });

  it('force reruns a ready company', async () => {
    const png = await rasterPng(48, 48);
    const { client } = writeTrackingClient();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === 'https://drivetrain.ai/') {
        return new Response('<link rel="icon" sizes="48x48" href="/icon.png">', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url.endsWith('/icon.png') || url.endsWith('/favicon.ico')) {
        return new Response(Uint8Array.from(png), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      return new Response('missing', { status: 404 });
    };
    const outcome = await resolveCompanyAsset(
      client,
      company({
        logoStatus: 'ready',
        logoStoragePath: `companies/${COMPANY_ID}/logo.webp`,
      }),
      { apply: true, force: true, deps: { lookup: publicLookup, fetchImpl } },
    );
    expect(outcome.status).toBe('ready');
  });

  it('caps concurrency', async () => {
    let inFlight = 0;
    let max = 0;
    await mapPool([1, 2, 3, 4, 5, 6], 3, async () => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return true;
    });
    expect(max).toBeLessThanOrEqual(3);
  });
});
