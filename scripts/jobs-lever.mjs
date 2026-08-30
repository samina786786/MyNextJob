import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(
  process.execPath,
  [
    '--experimental-strip-types',
    '--experimental-transform-types',
    '--no-warnings=ExperimentalWarning',
    '--import',
    './scripts/register-ts-alias.mjs',
    './src/lib/jobs/dev/run-lever-cli.ts',
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
