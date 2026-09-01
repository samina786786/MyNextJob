/**
 * Provision a dedicated local Playwright user for authenticated Phase 5B tests.
 * Writes E2E_USER_EMAIL / E2E_USER_PASSWORD to `.env.local` only when missing.
 * Does not touch the job catalog.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function applyEnvFile(file) {
  const full = resolve(process.cwd(), file);
  if (!existsSync(full)) return;
  for (const raw of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

applyEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const email = process.env.E2E_USER_EMAIL || 'e2e.phase5b@example.com';
const hadPassword = Boolean(process.env.E2E_USER_PASSWORD);
const password = process.env.E2E_USER_PASSWORD || `E2e.${randomBytes(18).toString('base64url')}Aa1`;

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserIdByEmail(target) {
  const wanted = target.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

let userId = await findUserIdByEmail(email);
if (!userId) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Feed' },
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  userId = data.user.id;
} else {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Feed' },
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (!process.env.E2E_USER_EMAIL || !hadPassword) {
  appendFileSync(
    resolve(process.cwd(), '.env.local'),
    `\n# Local Playwright authenticated feed tests — never commit\nE2E_USER_EMAIL=${email}\nE2E_USER_PASSWORD=${password}\n`,
  );
}

console.log('E2E auth user ready (local only; catalog unchanged)');
console.log(`user_id=${userId}`);
