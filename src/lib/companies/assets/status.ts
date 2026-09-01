export const COMPANY_LOGO_STATUSES = ['pending', 'ready', 'unresolved', 'failed'] as const;

export type CompanyLogoStatus = (typeof COMPANY_LOGO_STATUSES)[number];

export function isCompanyLogoStatus(value: unknown): value is CompanyLogoStatus {
  return typeof value === 'string' && (COMPANY_LOGO_STATUSES as readonly string[]).includes(value);
}
