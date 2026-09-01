import sharp from 'sharp';

export async function rasterPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; alpha: number } = { r: 16, g: 185, b: 129, alpha: 1 },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: color },
  })
    .png()
    .toBuffer();
}

export async function rasterJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function rasterWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 64, b: 175, alpha: 1 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

export function svgMarkup(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#059669"/></svg>',
  );
}

export function icoWithPngPayload(png: Buffer): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const directory = Buffer.alloc(16);
  directory.writeUInt8(16, 0);
  directory.writeUInt8(16, 1);
  directory.writeUInt16LE(1, 4);
  directory.writeUInt16LE(32, 6);
  directory.writeUInt32LE(png.length, 8);
  directory.writeUInt32LE(22, 12);
  return Buffer.concat([header, directory, png]);
}
