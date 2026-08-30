/**
 * Generate PWA icon PNGs from the canonical SVG source using `sharp`.
 * Run with:  node scripts/generate-icons.mjs
 *
 * Producing:
 *   public/icons/icon-192.png           192×192  purpose: any
 *   public/icons/icon-512.png           512×512  purpose: any
 *   public/icons/icon-maskable-512.png  512×512  purpose: maskable (safe area)
 *   public/icons/apple-touch-icon.png   180×180  iOS home screen
 *   public/favicon.ico                  32×32    (single-frame PNG in .ico)
 */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'public', 'icons', 'icon-source.svg');
const OUT = join(ROOT, 'public', 'icons');
const IVORY = { r: 246, g: 243, b: 234, alpha: 1 };

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function rasterize(svg, size) {
  return sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: IVORY })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function rasterizeMaskable(svg, size) {
  // Maskable icons must include a "safe zone" — Android launchers can crop
  // ~10% off every side. Render the mark inset by ~15% and fill the frame
  // with the warm ivory so any crop looks intentional.
  const inner = Math.round(size * 0.72);
  const mark = await sharp(svg, { density: 512 })
    .resize(inner, inner, { fit: 'contain', background: IVORY })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: IVORY },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const svg = await readFile(SRC);
  await ensureDir(OUT);

  const jobs = [
    { name: 'icon-192.png', size: 192, fn: rasterize },
    { name: 'icon-512.png', size: 512, fn: rasterize },
    { name: 'icon-maskable-512.png', size: 512, fn: rasterizeMaskable },
    { name: 'apple-touch-icon.png', size: 180, fn: rasterize },
  ];

  for (const { name, size, fn } of jobs) {
    const buf = await fn(svg, size);
    await writeFile(join(OUT, name), buf);
    console.log(`  wrote ${name}  (${size}×${size}, ${buf.length} bytes)`);
  }

  // Favicon: a single 32×32 PNG inside a minimal ICO container is broadly
  // supported by browsers today, and lets us reuse the sharp pipeline.
  const fav = await sharp(svg, { density: 256 })
    .resize(32, 32, { fit: 'contain', background: IVORY })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const ico = pngToIco(fav, 32);
  await writeFile(join(ROOT, 'public', 'favicon.ico'), ico);
  console.log(`  wrote favicon.ico  (32×32, ${ico.length} bytes)`);
}

// Minimal single-image ICO wrapper around a PNG payload.
// Structure: ICONDIR (6) + ICONDIRENTRY (16) + PNG data.
function pngToIco(png, size) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);       // reserved
  dir.writeUInt16LE(1, 2);       // type = icon
  dir.writeUInt16LE(1, 4);       // count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);        // palette count
  entry.writeUInt8(0, 3);        // reserved
  entry.writeUInt16LE(1, 4);     // color planes
  entry.writeUInt16LE(32, 6);    // bits per pixel
  entry.writeUInt32LE(png.length, 8);           // size
  entry.writeUInt32LE(6 + 16, 12);              // offset

  return Buffer.concat([dir, entry, png]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
