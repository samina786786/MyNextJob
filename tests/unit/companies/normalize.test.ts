import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { COMPANY_LOGO_MAX_EDGE } from '@/lib/companies/assets/paths';
import { normalizeCompanyLogo } from '@/lib/companies/assets/normalize';
import { rasterPng } from './image-fixtures';

describe('logo normalization', () => {
  it('fits different aspect ratios onto a stable 256 canvas without stretching', async () => {
    const wide = await normalizeCompanyLogo(await rasterPng(400, 100));
    const tall = await normalizeCompanyLogo(await rasterPng(80, 240));
    expect(wide.width).toBe(COMPANY_LOGO_MAX_EDGE);
    expect(wide.height).toBe(COMPANY_LOGO_MAX_EDGE);
    expect(tall.width).toBe(COMPANY_LOGO_MAX_EDGE);
    expect(tall.height).toBe(COMPANY_LOGO_MAX_EDGE);
    expect(wide.contentType).toBe('image/webp');

    const decoded = await sharp(wide.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = decoded.data.subarray(0, 4);
    expect(corner[3]).toBe(0);
  });

  it('keeps normalized files small', async () => {
    const logo = await normalizeCompanyLogo(await rasterPng(256, 256));
    expect(logo.buffer.length).toBeGreaterThan(32);
    expect(logo.buffer.length).toBeLessThan(80_000);
  });
});
