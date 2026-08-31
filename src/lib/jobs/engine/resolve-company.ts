import { isUniqueViolation, ValidationError } from '@/lib/jobs/errors';
import {
  companySlugBase,
  companySlugWithCollisionSuffix,
} from '@/lib/jobs/normalization/normalize-company';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';
import type { CompanyRecord, JobEngineStore } from '@/lib/jobs/repository/types';

/**
 * Resolve company identity conservatively:
 *   explicit company_id → canonical domain → exactly one name_key → create
 *
 * Name matching is exact on the folded key only. "ABC" and
 * "ABC Technologies" stay distinct. Multiple name_key hits are
 * ambiguous and are not merged or auto-created.
 */
export async function resolveCompany(
  store: JobEngineStore,
  job: PreparedJob,
): Promise<CompanyRecord> {
  if (job.companyId) {
    const existing = await store.findCompanyById(job.companyId);
    if (existing) return existing;
  }
  if (job.companyDomain) {
    const byDomain = await store.findCompanyByDomain(job.companyDomain);
    if (byDomain) return byDomain;
  }
  const byName = await store.findCompaniesByNameKey(job.companyNameKey);
  if (byName.length > 1) {
    throw new ValidationError(
      'missing_company',
      'Company name_key matches more than one canonical company',
    );
  }
  if (byName.length === 1) {
    return byName[0]!;
  }
  try {
    return await store.insertCompany({
      name: job.companyName,
      nameKey: job.companyNameKey,
      slug: companySlugBase(job.companyName),
      domain: job.companyDomain,
    });
  } catch (error) {
    if (isUniqueViolation(error) && job.companyDomain) {
      const raced = await store.findCompanyByDomain(job.companyDomain);
      if (raced) return raced;
    }
    if (isUniqueViolation(error)) {
      return store.insertCompany({
        name: job.companyName,
        nameKey: job.companyNameKey,
        slug: companySlugWithCollisionSuffix(job.companyName, job.companyNameKey),
        domain: job.companyDomain,
      });
    }
    throw error;
  }
}
