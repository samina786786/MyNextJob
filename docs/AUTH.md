# Authentication

Phase 1 implements email + password auth with Supabase Auth and cookie
SSR. OAuth, magic-link-only login, and phone auth are out of scope.

See also [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the dashboard
checklist below.

## Phase 1.1 status (2026-08-30)

`@supabase/ssr` is **0.12.5** (already current stable 0.12.x; no further
upgrade). Proxy and server clients use the official two-argument
`setAll(cookies, headers)` contract. When the package emits cache
headers (`Cache-Control`, `Expires`, `Pragma`), `src/lib/supabase/proxy.ts`
copies them onto the Next.js Proxy response. There is no manual
fallback header map.

**A real development project is connected** via `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`). Credentials are not
logged here.

### Automated tests (this pass)

- Lint, typecheck, and 30 unit tests passed.
- Production build passed (`.env.local` loaded).
- Playwright E2E: form validation, `sanitizeNext()`, anonymous
  `/home` → `/sign-in?next=%2Fhome`, unauthenticated `/reset-password`
  (no `updateUser` form), invalid `/auth/confirm` → `/error` without
  `token_hash`, generic forgot-password inbox copy, clay sign-in error
  without SDK dumps.

### Live project probes (HTTP, not Node `fetch`)

Proven against the hosted Auth/Data API:

- Auth is healthy. Email/password is on. Signup is allowed.
  Confirm-email is on (`mailer_autoconfirm` false). OAuth and phone
  are off.
- `public.profiles` and `public.jobs` exist. Anonymous `SELECT` is
  denied (`42501`) — expected until `0003` grants `authenticated`.
- The private `resumes` storage bucket is **missing**.
- Anonymous `/home` returns `307` to `/sign-in?next=%2Fhome` with
  `Cache-Control: no-cache, must-revalidate` (not public-cacheable).
- Invalid confirm redirects to `/error` and does not keep `token_hash`
  on the Location header.

### Not verified live

This agent could not apply SQL or finish the inbox lifecycle:

- No Supabase CLI, no access token, no database password, no
  service-role key (correct — it is not in `NEXT_PUBLIC_*`).
- Cursor Supabase MCP is configured but not signed in.
- Avast HTTPS scanning re-signs `*.supabase.co` with a local root
  Windows trusts and Node 22.13 does not. `pnpm dev` / `pnpm start` /
  `pnpm test:e2e` run through `scripts/with-system-ca.mjs`, which loads
  the Windows CA store via `NODE_EXTRA_CA_CERTS` (TLS verification stays
  on). You can also turn off Avast “HTTPS scanning” so Node sees the
  real certificate chain.
- `0001` looks partially applied (tables exist, bucket does not).
  `0002` trigger and `0003` Data API grants are **not confirmed**.
- Dashboard Site URL, redirect allow-list, and Confirm signup
  template cannot be read from the public Auth settings API.
- Signup → inbox → `/auth/confirm` → `/home` was not completed.
- Profile row + two-user RLS was not completed.
- Signed-in session refresh, cookie names/values, and password reset
  email were not completed.
- Custom production SMTP is still pending.

### Apply on the development project

Run in order in the SQL Editor, or `supabase db push` once the CLI
is linked:

1. `supabase/migrations/0001_initial_schema.sql` (creates the
   `resumes` bucket if missing)
2. `supabase/migrations/0002_auth_profile_provisioning.sql`
3. `supabase/migrations/0003_data_api_grants.sql` (explicit
   `authenticated` grants; required on projects that no longer
   auto-expose `public` tables)

---

## `@supabase/ssr` 0.12.5 contract

`SetAllCookies` requires a second argument:

```ts
setAll(cookiesToSet, headers) {
  // write cookies…
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}
```

When auth cookies are written, the package passes:

```text
Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0
Expires: 0
Pragma: no-cache
```

Implementation:

- `src/lib/supabase/proxy.ts` — copies every header onto the Proxy
  response after rewriting cookies.
- `src/lib/supabase/server.ts` — accepts `headers` (required by types)
  but cannot mutate the outgoing response from a Server Component.
  The next Proxy pass writes cookies and cache headers.

Do not authorize from `getSession()`. Trusted identity uses
`supabase.auth.getClaims()` (`src/lib/auth/session.ts`). Proxy only
refreshes the session.

---

## Route model

### Public

- `/` — marketing landing (Get started / Sign in, or Open MyNextJob)
- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password` — public route; password change requires a recovery session
- `/error` — friendly expired-link state
- `/auth/confirm` — email OTP (`token_hash` + `type`)
- `/auth/callback` — PKCE `code` exchange
- `/design-system`

### Protected (server `getClaims()`)

- `/home`

Future app routes (`/profile`, `/saved`, …) join this group.

`src/proxy.ts` only refreshes the session. It does not query the
database or act as the security boundary. Protected layouts call
`getAuthIdentity()` / `requireAuth()`, which use `supabase.auth.getClaims()`.
Never authorize from `getSession()`.

## Flow

1. **Sign up** — `signUp()` with `full_name` in user metadata. If the
   project requires confirmation, the UI shows “Check your inbox”. If a
   session is returned immediately, redirect to `/home`.
2. **Confirm** — Confirm-signup email hits `/auth/confirm?token_hash=…&type=email`.
   `verifyOtp()` establishes the cookie session. Token query params are
   not forwarded. Success → `/home`. Failure → `/error`.
3. **Sign in** — `signInWithPassword()`. `?next=` is sanitized to an
   allow-listed internal path (default `/home`).
4. **Forgot password** — `resetPasswordForEmail()` with
   `redirectTo` → `/auth/callback?next=/reset-password`. The UI always
   shows a generic inbox message (no account enumeration).
5. **Callback** — `exchangeCodeForSession(code)`, then a safe `next`.
6. **Reset password** — `updateUser({ password })` only when
   `getClaims()` shows a session.
7. **Sign out** — server action `signOut()`, then `/sign-in`.
8. **Profile row** — migration `0002_auth_profile_provisioning.sql`
   inserts `public.profiles` on `auth.users` insert.

## Local environment

Copy `.env.example` to `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Never put the service-role key in a `NEXT_PUBLIC_*` variable.

---

## Supabase Dashboard setup

These steps cannot be applied from the repo. Do them in the project
dashboard.

**Verified from the public Auth settings API (2026-08-30):** Email
provider on, confirm-email on, signup enabled, OAuth/phone off.

**Not readable from the API — still a Dashboard check:** Site URL,
redirect allow-list, Confirm signup template, reset-password redirect.

### 1. Authentication provider

Authentication → Providers → **Email** → enable Email / Password.

Do not enable Google, GitHub, Apple, or phone for Phase 1.

### 2. Email confirmation

Keep **Confirm email** enabled for development validation and
production. The app handles an immediate session if confirmation is
disabled, but Phase 1.1 QA should leave it on.

### 3. Site URL

- Development: `http://localhost:3000`
- Production: `https://<production-domain>`

Set the same value in `.env.local` as `NEXT_PUBLIC_SITE_URL`.

### 4. Redirect URLs

Add (adjust the production host when you have one). Use the exact
allow-list format the current Dashboard shows (typically one URL per
line):

```text
http://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/reset-password
http://localhost:3000/reset-password
http://localhost:3000/home
```

Do not use localhost as the production Site URL.

### 5. Confirm signup email template

Authentication → Email Templates → **Confirm signup**.

Replace the default confirmation URL with the SSR token-hash pattern:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Do not use the implicit `#access_token` browser-fragment flow.

The dashboard change cannot be made from this repository.

### 6. Reset password email

The app sets `redirectTo` to `/auth/callback?next=/reset-password`.
Keep that URL in the allow list. Prefer the project’s PKCE / code
flow over exposing tokens in the page URL.

### 7. SMTP

The built-in Supabase email service is enough for development and is
rate-limited. **Custom production SMTP is still pending** and is not
part of Phase 1.1.

### 8. Apply migrations

```bash
supabase db push
```

or run `0001_initial_schema.sql`, then
`0002_auth_profile_provisioning.sql`, then
`0003_data_api_grants.sql` in the SQL editor.

Schema expectations after all three files:

- `public.profiles` exists; RLS enabled; owner-only policies
- `authenticated` has explicit table grants (`0003`); `anon` does not
  get user-owned tables
- `handle_new_user()` is `security definer` with `search_path = public`
- `EXECUTE` on `handle_new_user()` is revoked from `public` / `anon` /
  `authenticated`
- `on_auth_user_created` trigger on `auth.users`
- `on conflict (id) do nothing` prevents duplicate profile rows
- `storage.buckets.resumes` is **private** (`public = false`), PDF/DOCX only

**Not fully applied from this environment** — no linked CLI project.
Tables exist; the `resumes` bucket does not.

## Automated tests

These do **not** require a live Supabase project:

| Suite | Command | What it covers |
| --- | --- | --- |
| Lint | `pnpm lint` | ESLint flat config |
| Types | `pnpm typecheck` | Including 0.12.5 `setAll` types |
| Unit | `pnpm test` | Zod schemas, `sanitizeNext()`, safe error mapping |
| Build | `pnpm build` | Next.js production compile |
| E2E | `pnpm test:e2e` | Auth form UX, unsafe `next`, anonymous `/home`, expired reset, invalid confirm, clay sign-in error |

Do not add E2E that waits on confirmation email delivery.

## Manual live QA checklist

Requires `.env.local` pointed at a real development project and the
Dashboard items above. Automated E2E does **not** cover these.

### Signup

- [ ] Valid signup → confirmation email (or session + `/home` if confirm is off)
- [ ] Confirmation link opens `/auth/confirm`; after success the URL has no `token_hash` / OTP / `code`
- [ ] Duplicate signup → existing-account message or inbox state (no extra enumeration)
- [ ] Invalid email rejected
- [ ] Password shorter than 8 characters rejected
- [ ] Mismatched confirm password rejected
- [ ] Confirmation link signs the user in and lands on `/home`

### Profile + RLS

- [ ] Exactly one `profiles` row; `id` matches `auth.users.id`
- [ ] `full_name` from signup metadata
- [ ] Owner can read their profile with the authenticated client
- [ ] A different authenticated user cannot read/update that row

### Sign in

- [ ] Valid credentials → `/home` (or sanitized `next`)
- [ ] Wrong password → clay error, no SDK dump, email retained, password not repopulated
- [ ] Unconfirmed email → “Please confirm your email…”

### Session

- [ ] Refresh on `/home` stays signed in
- [ ] New tab / reopen still authenticated while the session is valid
- [ ] Proxy refresh does not loop
- [ ] Auth tokens live in cookies, not `localStorage`
- [ ] Refresh does not leave malformed cookie chunks
- [ ] Responses that set auth cookies are not public-cacheable

### Protection

- [ ] Anonymous `/home` → `/sign-in?next=/home`
- [ ] After sign-in, sanitized `next` is honored; external `next` rejected
- [ ] Authenticated visit to `/sign-in` or `/sign-up` → `/home` (no loop)

### Recovery

- [ ] Forgot password always shows the generic inbox state (including unknown email)
- [ ] Reset email arrives; callback establishes session before password change
- [ ] Unauthenticated `/reset-password` does not call `updateUser({ password })`
- [ ] Expired / reused / altered link → friendly `/error` or expired reset screen (no token hash / stack)
- [ ] Valid reset updates the password
- [ ] Sign in with the new password works

### Sign out

- [ ] Session destroyed; redirect to `/sign-in`
- [ ] `/home` is inaccessible afterward
- [ ] Browser back does not restore a usable authenticated session
