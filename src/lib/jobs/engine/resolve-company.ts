import { isUniqueViolation } from '@/lib/jobs/errors';
import { companySlugBase } from '@/lib/jobs/normalization/normalize-company';
import type { JobEngineStore } from '@/lib/jobs/repository/types';
import type { CompanyRecord } from '@/lib/jobs/repository/types';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';

/**
 * Resolve company identity conservatively:
 *   explicit company_id → canonical domain → normalized name → create
 *
 * "Atlassian" and "Atlassian Pty Ltd" stay distinct. Case/whitespace
 * folding is the only merge on names.
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
  const byName = await store.findCompanyByNameKey(job.companyNameKey);
  if (byName) {
    if (job.companyDomain && !byName.domain) {
      return byName;
    }
    return byName;
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
    throw error;
  }
}
