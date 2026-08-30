# Authentication

Phase 1 implements email + password auth with Supabase Auth and cookie
SSR. OAuth, magic-link-only login, and phone auth are out of scope.

See also [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the dashboard
checklist below.

## Phase 1.1 status (2026-08-30)

`@supabase/ssr` was upgraded **0.5.2 → 0.12.5**. Proxy and server
clients use the official two-argument `setAll(cookies, headers)`
contract. Cache headers from the package (`Cache-Control`, `Expires`,
`Pragma`) are copied onto the Next.js Proxy response. There is no
manual fallback header map.

**A real development Supabase project was not connected in this
environment.** `.env.local` was not present, `NEXT_PUBLIC_SUPABASE_*`
was unset, and the Supabase CLI was not installed. Credentials were
not invented. Live signup, email, RLS, cookie, and dashboard checks
remain **unverified**.

### What was proven automatically

- Lint, typecheck, unit tests, production build, and Playwright E2E
  (unconfigured / no live credentials) after the SSR upgrade.
- Route-level behavior that does not need a live project: form
  validation, `sanitizeNext()` rejection of external `next` values,
  anonymous `/home` → `/sign-in`, reset page without a session does
  not offer `updateUser({ password })`.

### What still requires a human + Dashboard

- Applying `0001` then `0002` on the development project
- Email provider, confirm-email, Site URL, redirect allow-list
- Confirm-signup template (`token_hash` SSR link)
- Live signup → inbox → `/auth/confirm` → `/home`
- Profile trigger + real RLS with a second user
- Session refresh, cookies, cache headers on a live refresh
- Password recovery end-to-end
- Custom production SMTP

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
dashboard. **Not verified live in Phase 1.1** (no project credentials
in the agent environment).

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

or run `0001_initial_schema.sql` then
`0002_auth_profile_provisioning.sql` in the SQL editor.

Schema expectations after both files:

- `public.profiles` exists; RLS enabled; owner-only policies
- `handle_new_user()` is `security definer` with `search_path = public`
- `on_auth_user_created` trigger on `auth.users`
- `on conflict (id) do nothing` prevents duplicate profile rows
- `storage.buckets.resumes` is **private** (`public = false`), PDF/DOCX only

**Not applied from this environment** — no linked project.

## Automated tests

These do **not** require a live Supabase project:

| Suite | Command | What it covers |
| --- | --- | --- |
| Lint | `pnpm lint` | ESLint flat config |
| Types | `pnpm typecheck` | Including 0.12.5 `setAll` types |
| Unit | `pnpm test` | Zod schemas, `sanitizeNext()`, safe error mapping |
| Build | `pnpm build` | Next.js production compile |
| E2E | `pnpm test:e2e` | Auth form UX, unsafe `next`, anonymous `/home` |

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
