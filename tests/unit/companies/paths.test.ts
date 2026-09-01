import { afterEach, describe, expect, it } from 'vitest';

import {
  companyAssetPublicUrl,
  companyLogoStoragePath,
  companyLogoUrlForClient,
} from '@/lib/companies/assets/paths';
import { isMissingCompanyLogoColumn, readCompanyFeedFields } from '@/lib/jobs/feed/company-fields';

const COMPANY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('company asset paths', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('uses a deterministic company-id path', () => {
    expect(companyLogoStoragePath(COMPANY_ID)).toBe(`companies/${COMPANY_ID}/logo.webp`);
    expect(() => companyLogoStoragePath('Acme')).toThrow(/canonical company id/);
  });

  it('builds a public URL only for ready assets', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const path = companyLogoStoragePath(COMPANY_ID);
    expect(companyAssetPublicUrl(path)).toBe(
      `https://abc.supabase.co/storage/v1/object/public/company-assets/${path}`,
    );
    expect(companyLogoUrlForClient({ status: 'ready', storagePath: path })).toContain('/logo.webp');
    expect(companyLogoUrlForClient({ status: 'unresolved', storagePath: path })).toBeNull();
    expect(companyLogoUrlForClient({ status: 'failed', storagePath: path })).toBeNull();
  });

  it('reads feed embed fields without leaking storage internals', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    expect(
      readCompanyFeedFields({
        name: 'Drivetrain',
        logo_status: 'ready',
        logo_storage_path: companyLogoStoragePath(COMPANY_ID),
      }),
    ).toEqual({
      name: 'Drivetrain',
      logoUrl: `https://abc.supabase.co/storage/v1/object/public/company-assets/companies/${COMPANY_ID}/logo.webp`,
    });
    expect(isMissingCompanyLogoColumn('column companies.logo_status does not exist')).toBe(true);
    expect(isMissingCompanyLogoColumn('freshness_at does not exist')).toBe(false);
  });
});
