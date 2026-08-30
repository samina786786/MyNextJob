/**
 * Node 22 loader: resolve `@/` to `src/` and add `.ts` extensions so the
 * Greenhouse CLI can run with `--experimental-strip-types` (no tsx).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'src');

function resolveFile(base) {
  if (existsSync(base) && !base.endsWith('/') && !base.endsWith('\\')) {
    return base;
  }
  for (const ext of ['.ts', '.tsx', '.mts', '.js', '.mjs']) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['index.ts', 'index.js']) {
    const nested = join(base, ext);
    if (existsSync(nested)) return nested;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return {
      shortCircuit: true,
      url: pathToFileURL(join(root, 'scripts', 'empty-server-only.mjs')).href,
    };
  }

  if (specifier.startsWith('@/')) {
    const dest = resolveFile(join(srcRoot, specifier.slice(2)));
    if (dest) {
      return { shortCircuit: true, url: pathToFileURL(dest).href };
    }
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const dest = resolveFile(join(parentDir, specifier));
    if (dest) {
      return { shortCircuit: true, url: pathToFileURL(dest).href };
    }
  }

  return nextResolve(specifier, context);
}
