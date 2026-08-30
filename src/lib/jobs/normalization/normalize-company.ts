import { comparisonKey } from '@/lib/jobs/normalization/text';

/**
 * Conservative company comparison key.
 * Does NOT strip Ltd / Inc / LLC / Technologies / Systems — those can
 * distinguish real companies.
 */
export function normalizeCompanyName(name: string): string {
  return comparisonKey(name);
}

export function companySlugBase(name: string): string {
  const slug = comparisonKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : 'company';
}
