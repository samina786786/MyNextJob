import { companyLogoUrlForClient } from '@/lib/companies/assets/paths';
import { isCompanyLogoStatus } from '@/lib/companies/assets/status';

export const COMPANY_FEED_EMBED_WITH_LOGO =
  'companies(name, logo_status, logo_storage_path)';
export const COMPANY_FEED_EMBED_NAME_ONLY = 'companies(name)';

export type CompanyFeedEmbedRow = {
  name?: string | null;
  logo_status?: string | null;
  logo_storage_path?: string | null;
};

export function isMissingCompanyLogoColumn(message: string): boolean {
  return /logo_status|logo_storage_path/i.test(message);
}

export function readCompanyFeedFields(
  related: CompanyFeedEmbedRow | CompanyFeedEmbedRow[] | null | undefined,
): { name: string | null; logoUrl: string | null } {
  const row = Array.isArray(related) ? related[0] : related;
  if (!row) return { name: null, logoUrl: null };
  const name = typeof row.name === 'string' && row.name.trim() ? row.name : null;
  const status = isCompanyLogoStatus(row.logo_status) ? row.logo_status : null;
  return {
    name,
    logoUrl: companyLogoUrlForClient({
      status,
      storagePath: row.logo_storage_path ?? null,
    }),
  };
}
