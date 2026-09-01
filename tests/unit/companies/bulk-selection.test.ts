import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { listCompaniesForAssetRun } from '@/lib/companies/assets/store';
import { resolveCompanyAsset } from '@/lib/companies/assets/resolve';

type Call = { op: string; args: unknown[] };

/**
 * Phase 5E carried hardening: the bulk asset selection must NOT convert
 * a domain-null `pending` company into `unresolved`. Two guards:
 *   1. Bulk selection (`requireTrustedDomain: true` — the CLI default)
 *      only pulls companies whose domain is non-null.
 *   2. If a domain-null company is passed explicitly (e.g. via
 *      --company=<uuid>), `resolveCompanyAsset` returns `skipped` and
 *      the persist layer leaves the row alone.
 */

function makeClient(rows: unknown[] = []) {
  const calls: Call[] = [];
  function chain() {
    const api: Record<string, unknown> = {};
    api.select = (s: string) => {
      calls.push({ op: 'select', args: [s] });
      return api;
    };
    api.order = (col: string, opts?: { ascending?: boolean }) => {
      calls.push({ op: 'order', args: [col, opts] });
      return api;
    };
    api.limit = (n: number) => {
      calls.push({ op: 'limit', args: [n] });
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      calls.push({ op: 'eq', args: [col, val] });
      return api;
    };
    api.in = (col: string, val: readonly string[]) => {
      calls.push({ op: 'in', args: [col, [...val]] });
      return api;
    };
    api.not = (col: string, op: string, val: null | boolean) => {
      calls.push({ op: 'not', args: [col, op, val] });
      return api;
    };
    (api as unknown as PromiseLike<unknown>).then = ((
      onfulfilled?: ((value: unknown) => unknown) | null,
    ) => {
      const result = { data: rows, error: null };
      return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
    }) as PromiseLike<unknown>['then'];
    return api;
  }
  const client = { from: () => chain() } as unknown as SupabaseClient;
  return { client, calls };
}

describe('listCompaniesForAssetRun — bulk selection', () => {
  it('by default excludes companies with a null domain', async () => {
    const { client, calls } = makeClient([]);
    await listCompaniesForAssetRun(client, {
      limit: 50,
      includeFailed: false,
      includeReady: false,
    });
    const notCall = calls.find((c) => c.op === 'not');
    expect(notCall?.args).toEqual(['domain', 'is', null]);
  });

  it('with --company=<uuid> (companyId set) skips the domain gate', async () => {
    const { client, calls } = makeClient([]);
    await listCompaniesForAssetRun(client, {
      companyId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      limit: 50,
      includeFailed: false,
      includeReady: false,
    });
    expect(calls.some((c) => c.op === 'not')).toBe(false);
    const eqCall = calls.find((c) => c.op === 'eq' && c.args[0] === 'id');
    expect(eqCall).toBeDefined();
  });

  it('when requireTrustedDomain=false is passed explicitly, the domain gate is skipped', async () => {
    const { client, calls } = makeClient([]);
    await listCompaniesForAssetRun(client, {
      limit: 50,
      includeFailed: false,
      includeReady: false,
      requireTrustedDomain: false,
    });
    expect(calls.some((c) => c.op === 'not')).toBe(false);
  });
});

describe('resolveCompanyAsset — domain-null row is skipped, not marked unresolved', () => {
  it('returns skipped instead of unresolved when domain is null', async () => {
    const supabase = {
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
        }),
      },
    } as unknown as SupabaseClient;
    const outcome = await resolveCompanyAsset(
      supabase,
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        name: 'Toptal',
        domain: null,
        logoStatus: 'pending',
        logoStoragePath: null,
        logoUpdatedAt: null,
        logoCheckedAt: null,
      },
      { apply: true, force: false },
    );
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') {
      expect(outcome.reason).toMatch(/no trusted domain/i);
    }
  });
});
