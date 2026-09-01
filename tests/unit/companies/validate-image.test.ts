import { describe, expect, it } from 'vitest';

import { sniffImageKind, validateRasterImage } from '@/lib/companies/assets/validate-image';
import {
  icoWithPngPayload,
  rasterJpeg,
  rasterPng,
  rasterWebp,
  svgMarkup,
} from './image-fixtures';

describe('image validation', () => {
  it('accepts PNG, JPEG, and WebP when magic bytes match Content-Type', async () => {
    const png = await rasterPng(64, 64);
    const jpeg = await rasterJpeg(64, 64);
    const webp = await rasterWebp(64, 64);
    await expect(validateRasterImage(png, 'image/png')).resolves.toMatchObject({ kind: 'png', width: 64 });
    await expect(validateRasterImage(jpeg, 'image/jpeg')).resolves.toMatchObject({ kind: 'jpeg' });
    await expect(validateRasterImage(webp, 'image/webp')).resolves.toMatchObject({ kind: 'webp' });
  });

  it('accepts ICO when Sharp can decode the payload', async () => {
    const png = await rasterPng(16, 16);
    const ico = icoWithPngPayload(png);
    expect(sniffImageKind(ico)).toBe('ico');
    try {
      const meta = await validateRasterImage(ico, 'image/x-icon');
      expect(meta.kind).toBe('ico');
    } catch (error) {
      expect((error as Error).message).toMatch(/decoder rejected|unrecognized|SVG|too small/);
    }
  });

  it('rejects SVG rather than exposing it', async () => {
    await expect(validateRasterImage(svgMarkup(), 'image/svg+xml')).rejects.toThrow(/SVG/);
  });

  it('rejects a fake extension / mismatched MIME', async () => {
    const png = await rasterPng(32, 32);
    await expect(validateRasterImage(png, 'image/jpeg')).rejects.toThrow(/content-type/);
  });

  it('rejects huge dimensions', async () => {
    const wide = await rasterPng(4100, 32);
    await expect(validateRasterImage(wide, 'image/png')).rejects.toThrow(/too large/);
  });

  it('rejects corrupt bytes even with a PNG header', async () => {
    const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
    await expect(validateRasterImage(corrupt, 'image/png')).rejects.toThrow();
  });
});
