/**
 * Launch a child command with Windows trusted CAs available to Node.
 *
 * Node ships its own Mozilla CA bundle and (before --use-system-ca) ignores
 * the Windows store. HTTPS-inspecting antivirus (Avast Web/Mail Shield here)
 * re-signs TLS with a local root Windows trusts, which Node then rejects as
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. This wrapper exports that store to PEM and
 * sets NODE_EXTRA_CA_CERTS. It does not disable TLS verification.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('usage: node scripts/with-system-ca.mjs <command> [...args]');
  process.exit(1);
}

if (process.platform === 'win32' && !process.env.NODE_EXTRA_CA_CERTS) {
  const outDir = join(root, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const pemPath = join(outDir, 'windows-ca-bundle.pem');
  const exporter = join(root, 'scripts', 'export-windows-cas.ps1');
  const exported = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', exporter, '-OutFile', pemPath],
    { cwd: root, windowsHide: true, encoding: 'utf8' },
  );
  if (exported.status !== 0) {
    console.error(exported.stderr || exported.stdout || 'Failed to export Windows CA certificates.');
    process.exit(exported.status ?? 1);
  }
  process.env.NODE_EXTRA_CA_CERTS = pemPath;
}

const child = spawn(args[0], args.slice(1), {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
