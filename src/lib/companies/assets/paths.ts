import type { CompanyLogoStatus } from '@/lib/companies/assets/status';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

export const COMPANY_ASSETS_BUCKET = 'company-assets';
export const COMPANY_LOGO_FILENAME = 'logo.webp';
export const COMPANY_LOGO_MAX_EDGE = 256;

const COMPANY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function companyLogoStoragePath(companyId: string): string {
  if (!COMPANY_ID_RE.test(companyId)) {
    throw new Error('company logo path requires a canonical company id');
  }
  return `companies/${companyId.toLowerCase()}/${COMPANY_LOGO_FILENAME}`;
}

export function isCompanyLogoStoragePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const match = /^companies\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/logo\.webp$/i.exec(
    path,
  );
  return Boolean(match);
}

/**
 * Public object URL for a stored company logo. Central helper — do not
 * persist this string. Returns null when the origin is missing or the
 * path is not our deterministic key.
 */
export function companyAssetPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath || !isCompanyLogoStoragePath(storagePath)) return null;
  const { url } = getSupabasePublicEnv();
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${COMPANY_ASSETS_BUCKET}/${storagePath}`;
}

export function companyLogoUrlForClient(input: {
  status: CompanyLogoStatus | null | undefined;
  storagePath: string | null | undefined;
}): string | null {
  if (input.status !== 'ready') return null;
  return companyAssetPublicUrl(input.storagePath);
}
