import { createHash } from 'node:crypto';

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

/** Deterministic 8-char suffix for slug collisions. Never random. */
export function companySlugCollisionSuffix(nameKey: string): string {
  return createHash('sha256').update(nameKey).digest('hex').slice(0, 8);
}

export function companySlugWithCollisionSuffix(name: string, nameKey: string): string {
  const base = companySlugBase(name);
  const suffix = companySlugCollisionSuffix(nameKey);
  return `${base}-${suffix}`.slice(0, 80);
}
