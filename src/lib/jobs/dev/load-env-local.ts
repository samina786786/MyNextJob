import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load `.env.local` into process.env when a value is not already set.
 * Never logs values. CLI-only — Next.js already loads this file.
 */
export function loadEnvLocal(cwd = process.cwd()): void {
  const path = resolve(cwd, '.env.local');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
