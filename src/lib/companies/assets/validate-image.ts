import sharp, { type Metadata } from 'sharp';

import { UnsafeOutboundUrlError } from '@/lib/companies/assets/ssrf';

export const MAX_INPUT_PIXELS = 4096 * 4096;
export const MIN_EDGE_PX = 16;
export const MAX_EDGE_PX = 4096;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP = Buffer.from('WEBP', 'ascii');
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const GIF = Buffer.from('GIF8', 'ascii');

export type DetectedImageKind = 'png' | 'jpeg' | 'webp' | 'ico' | 'gif' | 'unknown';

export function sniffImageKind(buffer: Buffer): DetectedImageKind {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PNG)) return 'png';
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG)) return 'jpeg';
  if (buffer.length >= 12 && buffer.subarray(8, 12).equals(WEBP)) return 'webp';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ICO)) return 'ico';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(GIF)) return 'gif';
  return 'unknown';
}

function contentTypeAllows(kind: DetectedImageKind, contentType: string): boolean {
  if (!contentType) return true;
  const type = contentType.split(';')[0]?.trim() ?? '';
  if (type === 'application/octet-stream' || type === 'binary/octet-stream') return true;
  if (kind === 'png') return type === 'image/png';
  if (kind === 'jpeg') return type === 'image/jpeg' || type === 'image/jpg';
  if (kind === 'webp') return type === 'image/webp';
  if (kind === 'ico') return type === 'image/x-icon' || type === 'image/vnd.microsoft.icon' || type === 'image/ico';
  if (kind === 'gif') return type === 'image/gif';
  return false;
}

export async function validateRasterImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ kind: DetectedImageKind; width: number; height: number }> {
  if (buffer.length < 24) {
    throw new UnsafeOutboundUrlError('image too small');
  }
  if (buffer[0] === 0x3c && (buffer[1] === 0x3f || buffer[1] === 0x73 || buffer[1] === 0x53)) {
    throw new UnsafeOutboundUrlError('SVG is not accepted as a company logo source');
  }
  const kind = sniffImageKind(buffer);
  if (kind === 'unknown') {
    throw new UnsafeOutboundUrlError('unrecognized image magic bytes');
  }
  if (!contentTypeAllows(kind, contentType)) {
    throw new UnsafeOutboundUrlError('content-type does not match image bytes');
  }

  let meta: Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new UnsafeOutboundUrlError('image decoder rejected the payload');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_EDGE_PX || height < MIN_EDGE_PX) {
    throw new UnsafeOutboundUrlError('image dimensions are too small');
  }
  if (width > MAX_EDGE_PX || height > MAX_EDGE_PX) {
    throw new UnsafeOutboundUrlError('image dimensions are too large');
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new UnsafeOutboundUrlError('pixel count exceeds the safety cap');
  }
  return { kind, width, height };
}
