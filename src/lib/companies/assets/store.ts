import type { SupabaseClient } from '@supabase/supabase-js';

import {
  COMPANY_ASSETS_BUCKET,
  companyLogoStoragePath,
} from '@/lib/companies/assets/paths';
import type { CompanyLogoStatus } from '@/lib/companies/assets/status';
import { isCompanyLogoStatus } from '@/lib/companies/assets/status';
import { PersistenceError } from '@/lib/jobs/errors';

export type CompanyAssetRow = {
  id: string;
  name: string;
  domain: string | null;
  logoStatus: CompanyLogoStatus;
  logoStoragePath: string | null;
  logoUpdatedAt: string | null;
  logoCheckedAt: string | null;
};

export type CompanyAssetPatch = {
  logoStatus: CompanyLogoStatus;
  logoStoragePath?: string | null;
  logoUpdatedAt?: string | null;
  logoCheckedAt: string;
};

function mapRow(row: Record<string, unknown>): CompanyAssetRow {
  const status = isCompanyLogoStatus(row.logo_status) ? row.logo_status : 'pending';
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    domain: row.domain == null ? null : String(row.domain),
    logoStatus: status,
    logoStoragePath: row.logo_storage_path == null ? null : String(row.logo_storage_path),
    logoUpdatedAt: row.logo_updated_at == null ? null : String(row.logo_updated_at),
    logoCheckedAt: row.logo_checked_at == null ? null : String(row.logo_checked_at),
  };
}

export async function listCompaniesForAssetRun(
  client: SupabaseClient,
  input: {
    companyId?: string;
    limit: number;
    includeFailed: boolean;
    includeReady: boolean;
    /**
     * Bulk selection excludes companies with no trusted domain by default.
     * The pipeline cannot fetch a homepage without one, so processing them
     * only wastes a lookup and converts a benign `pending` row into
     * `unresolved`. Explicit `--company=<uuid>` runs still bypass this
     * gate so an operator can force-run a specific row.
     */
    requireTrustedDomain?: boolean;
  },
): Promise<CompanyAssetRow[]> {
  let query = client
    .from('companies')
    .select('id, name, domain, logo_status, logo_storage_path, logo_updated_at, logo_checked_at')
    .order('name', { ascending: true })
    .limit(input.limit);

  if (input.companyId) {
    query = query.eq('id', input.companyId);
  } else {
    if (!input.includeReady) {
      const statuses: CompanyLogoStatus[] = ['pending'];
      if (input.includeFailed) statuses.push('failed');
      query = query.in('logo_status', statuses);
    }
    if (input.requireTrustedDomain !== false) {
      // .not('domain','is', null) — Supabase JS translates this to `domain=not.is.null`.
      query = query.not('domain', 'is', null);
    }
  }

  const { data, error } = await query;
  if (error) throw new PersistenceError(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map(mapRow);
}

export async function updateCompanyAssetMetadata(
  client: SupabaseClient,
  companyId: string,
  patch: CompanyAssetPatch,
): Promise<void> {
  const { error } = await client
    .from('companies')
    .update({
      logo_status: patch.logoStatus,
      logo_storage_path: patch.logoStoragePath === undefined ? undefined : patch.logoStoragePath,
      logo_updated_at: patch.logoUpdatedAt === undefined ? undefined : patch.logoUpdatedAt,
      logo_checked_at: patch.logoCheckedAt,
    })
    .eq('id', companyId);
  if (error) throw new PersistenceError(error.message);
}

export async function uploadCompanyLogo(
  client: SupabaseClient,
  companyId: string,
  bytes: Buffer,
): Promise<string> {
  const path = companyLogoStoragePath(companyId);
  const { error } = await client.storage.from(COMPANY_ASSETS_BUCKET).upload(path, bytes, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: 'public, max-age=86400',
  });
  if (error) throw new PersistenceError(error.message);
  return path;
}

export async function companyLogoObjectExists(
  client: SupabaseClient,
  path: string,
): Promise<boolean> {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const file = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  const { data, error } = await client.storage.from(COMPANY_ASSETS_BUCKET).list(folder, {
    search: file,
    limit: 10,
  });
  if (error) return false;
  return (data ?? []).some((object) => object.name === file);
}
