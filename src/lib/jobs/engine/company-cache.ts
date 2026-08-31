import { isUniqueViolation, ValidationError } from '@/lib/jobs/errors';
import {
  companySlugBase,
  companySlugWithCollisionSuffix,
} from '@/lib/jobs/normalization/normalize-company';
import type { PreparedJob } from '@/lib/jobs/normalization/normalize-job';
import type { CompanyRecord, JobEngineStore } from '@/lib/jobs/repository/types';

export type CompanyLookupCounts = {
  byId: number;
  byDomain: number;
  byNameKey: number;
  inserts: number;
};

/**
 * Per-sync company resolution cache. Domain > unique name_key > create.
 * Fixed-company ATS jobs hit byId once per company per run.
 */
export class CompanyResolutionCache {
  readonly counts: CompanyLookupCounts = { byId: 0, byDomain: 0, byNameKey: 0, inserts: 0 };
  private readonly byId = new Map<string, CompanyRecord>();
  private readonly byDomain = new Map<string, CompanyRecord>();
  private readonly byNameKey = new Map<string, CompanyRecord[]>();

  constructor(private readonly store: JobEngineStore) {}

  remember(company: CompanyRecord): void {
    this.byId.set(company.id, company);
    if (company.domain) this.byDomain.set(company.domain.toLowerCase(), company);
    const list = this.byNameKey.get(company.nameKey) ?? [];
    if (!list.some((row) => row.id === company.id)) list.push(company);
    this.byNameKey.set(company.nameKey, list);
  }

  async resolve(job: PreparedJob): Promise<CompanyRecord> {
    if (job.companyId) {
      const cached = this.byId.get(job.companyId);
      if (cached) return cached;
      this.counts.byId += 1;
      const existing = await this.store.findCompanyById(job.companyId);
      if (existing) {
        this.remember(existing);
        return existing;
      }
    }
    if (job.companyDomain) {
      const key = job.companyDomain.toLowerCase();
      const cached = this.byDomain.get(key);
      if (cached) return cached;
      this.counts.byDomain += 1;
      const byDomain = await this.store.findCompanyByDomain(job.companyDomain);
      if (byDomain) {
        this.remember(byDomain);
        return byDomain;
      }
    }
    const cachedNames = this.byNameKey.get(job.companyNameKey);
    const byName = cachedNames ?? (await this.loadByNameKey(job.companyNameKey));
    if (byName.length > 1) {
      throw new ValidationError(
        'missing_company',
        'Company name_key matches more than one canonical company',
      );
    }
    if (byName.length === 1) {
      this.remember(byName[0]!);
      return byName[0]!;
    }
    return this.create(job);
  }

  private async loadByNameKey(nameKey: string): Promise<CompanyRecord[]> {
    this.counts.byNameKey += 1;
    const rows = await this.store.findCompaniesByNameKey(nameKey);
    this.byNameKey.set(nameKey, rows);
    for (const row of rows) this.remember(row);
    return rows;
  }

  private async create(job: PreparedJob): Promise<CompanyRecord> {
    this.counts.inserts += 1;
    try {
      const created = await this.store.insertCompany({
        name: job.companyName,
        nameKey: job.companyNameKey,
        slug: companySlugBase(job.companyName),
        domain: job.companyDomain,
      });
      this.remember(created);
      return created;
    } catch (error) {
      if (isUniqueViolation(error) && job.companyDomain) {
        const raced = await this.store.findCompanyByDomain(job.companyDomain);
        if (raced) {
          this.remember(raced);
          return raced;
        }
      }
      if (isUniqueViolation(error)) {
        this.counts.inserts += 1;
        const created = await this.store.insertCompany({
          name: job.companyName,
          nameKey: job.companyNameKey,
          slug: companySlugWithCollisionSuffix(job.companyName, job.companyNameKey),
          domain: job.companyDomain,
        });
        this.remember(created);
        return created;
      }
      throw error;
    }
  }
}
