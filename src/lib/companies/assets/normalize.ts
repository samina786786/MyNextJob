import sharp from 'sharp';

import { COMPANY_LOGO_MAX_EDGE } from '@/lib/companies/assets/paths';

export type NormalizedLogo = {
  buffer: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
};

export async function normalizeCompanyLogo(input: Buffer): Promise<NormalizedLogo> {
  const buffer = await sharp(input, { failOn: 'error', limitInputPixels: 4096 * 4096 })
    .rotate()
    .resize({
      width: COMPANY_LOGO_MAX_EDGE,
      height: COMPANY_LOGO_MAX_EDGE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    contentType: 'image/webp',
    width: meta.width ?? COMPANY_LOGO_MAX_EDGE,
    height: meta.height ?? COMPANY_LOGO_MAX_EDGE,
  };
}
