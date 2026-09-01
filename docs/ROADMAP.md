# Roadmap

Phase 0 is complete when the app has the foundation described in
[`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DATABASE.md`](./DATABASE.md), and
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). Later phases build features on
top of that foundation without changing it.

## Phase 0 — Foundation *(complete)*

Next.js + strict TypeScript + Tailwind + clay primitives + Motion +
Supabase clients + initial migration with RLS + private resume storage +
design tokens + app shell + PWA manifest + testing infrastructure +
documentation.

## Phase 0.1 — Foundation modernization *(complete)*

Stay on Phase 0 product scope. Upgrade the foundation to the current
supported toolchain without adding Authentication:

- Next.js 16 Active LTS + React 19
- Tailwind CSS v4 (`@tailwindcss/postcss`, `@theme`)
- ESLint 9 flat config (`eslint .`, not `next lint`)
- Geist Sans / Mono (no Inter stand-in)
- shadcn/ui initialized (`components.json`) for later Radix primitives
- Next.js `proxy.ts` helper naming (`src/lib/supabase/proxy.ts`)
- PWA PNG icons generated from the canonical SVG
- Resume storage restricted to PDF and DOCX

## Phase 1 — Authentication *(complete)*

Email + password only (no OAuth / magic-link-only / phone):

- Sign up, email confirmation (`/auth/confirm`), sign in, sign out
- Forgot / reset password (`/auth/callback` PKCE exchange)
- `src/proxy.ts` session refresh + `getClaims()` on protected `/home`
- Safe `?next=` sanitizer; profile provisioning trigger
- See [`AUTH.md`](./AUTH.md) for dashboard setup and the manual QA list

## Phase 2 — Profile & resume *(complete, live-verified)*

- Onboarding: resume upload → local parse → profile review → preferences.
- Private Storage upload, generated paths, retryable parse failures.
- Canonical skill taxonomy seed (~75 skills) + `resume_skills`.
- `/profile` and a completed `/home` greeting. No job matching yet.
- Details: [`PROFILE_RESUME.md`](./PROFILE_RESUME.md).

## Phase 3 — Job engine (core) *(complete and live-verified)*

- Provider-neutral adapter contract + synthetic adapter (tests/dev only).
- Normalized job schema, sanitization, URL validation, company resolution.
- Canonical jobs + `job_source_postings` provenance.
- Fingerprint (candidate, not unique), content hash, conservative dedupe.
- Lifecycle (`open` → `possibly_closed` → `closed`) with complete-snapshot
  misses only. Source failures never mass-close.
- Sync orchestrator, metrics JSON, backoff helper (no cron).
- Details: [`JOB_ENGINE.md`](./JOB_ENGINE.md).

## Phase 4 — Job sources

- **4A Greenhouse** — public Job Board API adapter, curated seed
  (`0006`), `pnpm jobs:greenhouse`. See
  [`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md).
- **4B Lever** — public Postings API v0 adapter, curated seed (`0007`),
  `pnpm jobs:lever`. See [`JOB_SOURCE_LEVER.md`](./JOB_SOURCE_LEVER.md).
- **4C Ashby** — public Job Posting API adapter, curated seed (`0008`),
  `pnpm jobs:ashby`. See [`JOB_SOURCE_ASHBY.md`](./JOB_SOURCE_ASHBY.md).
- **4D We Work Remotely** — official all-jobs RSS adapter, curated seed
  (`0009`), `pnpm jobs:wwr`. See
  [`JOB_SOURCE_WE_WORK_REMOTELY.md`](./JOB_SOURCE_WE_WORK_REMOTELY.md).
- Scheduler / cron for `next_sync_at` (not in 4A–4D).
- Live persistence uses Phase 3 `SupabaseJobStore` + `SUPABASE_SECRET_KEY`.

## Phase 5 — Discovery UI

### 5A — Feed data foundation *(complete; 0010 and 0011 live)*

- 30-day active catalog, `staleSkipped` admission, cleanup CLI.
- Cursor/keyset feed repository (page 15 / max 30).
- Column-limited `jobs` SELECT and `jobs.freshness_at` + feed index
  in [`0010_job_feed_foundation.sql`](../supabase/migrations/0010_job_feed_foundation.sql).
- Client grant hardening in
  [`0011_job_grant_hardening.sql`](../supabase/migrations/0011_job_grant_hardening.sql).
- Provider-neutral content-hash sync fast path.
- See [`JOB_FEED_FOUNDATION.md`](./JOB_FEED_FOUNDATION.md).

### 5B — Feed UI & infinite scroll *(complete)*

- Server-rendered first page of 15, keyset infinite scroll, Load more.
- Shared `jobsFresh` catalog cache; authenticated HTTP stays private.
- Mobile job cards, `/jobs/[id]`, Posted vs Found, WWR attribution.
- No logos, search, matching, or saves.
- See [`JOB_FEED_UI.md`](./JOB_FEED_UI.md).

### 5C — Company logos / assets *(code complete; 0012 not applied)*

- Shared `company-assets` bucket and public-safe company logo columns.
- Offline SSRF-hardened discovery CLI (`pnpm companies:assets`).
- 48×48 initials slot with optional self-hosted WebP overlay.
- Do not apply [`0012_company_assets.sql`](../supabase/migrations/0012_company_assets.sql)
  until the live pilot is approved.
- See [`COMPANY_ASSETS.md`](./COMPANY_ASSETS.md).

### 5D — Search, filters, attribution, feed QA *(code complete; 0013 not applied)*

- Lexical catalog search (`q`) over `jobs.title` and `companies.name`
  (company preflight).
- Categorical filters: `work` (remote/hybrid/onsite), `employment`
  (full_time/…/temporary), `location` (free text), `age` (1/7/14/30 days,
  capped at the 30-day catalog).
- URL is the source of truth. `/home?q=…&work=…` server-renders the
  first filtered page.
- Debounce + AbortController + filter-equality guard prevent stale
  responses from overwriting newer ones.
- Cursor is invalidated on any filter/query change; filtered feed keeps
  keyset pagination.
- Direct employer ATS attribution surfaces as `<Company> Careers`;
  aggregators keep their brand (`We Work Remotely`).
- `CompanyLogoTile` transparency layering fix: initials layer is hidden
  once the logo loads.
- Do not apply [`0013_job_search_filters.sql`](../supabase/migrations/0013_job_search_filters.sql)
  until Phase 5D is live-verified. See
  [`JOB_SEARCH_FILTERS.md`](./JOB_SEARCH_FILTERS.md).

### 5E — Source registry expansion *(code complete; 0014 not applied)*

- `public.job_sources` is the authoritative source-of-truth registry.
  `validateSourceConfig` refuses unsupported providers, malformed
  identifiers, or direct sources without a canonical company binding.
- New admin CLIs: `pnpm jobs:sources:verify` (READ-ONLY provider probe),
  `pnpm jobs:sources:audit [--coverage]` (registry health + catalog
  coverage report), `pnpm jobs:sync [--apply]` (multi-source ingestion,
  dry-run default, bounded concurrency, failure-isolated).
- Migration [`0014_source_registry_expansion.sql`](../supabase/migrations/0014_source_registry_expansion.sql)
  is a narrow legacy repair only (unresolved-domain-null → pending).
  No new seeds — see [`JOB_SOURCE_REGISTRY_CANDIDATES.md`](./JOB_SOURCE_REGISTRY_CANDIDATES.md).
- `companies:assets` bulk selection now excludes domain-null rows;
  explicit `--company=<uuid>` still bypasses the gate.
- Phase 5D search carryover fix: `%%`, `**`, `__`, `\` etc. can no
  longer become `ILIKE '%%'` — parser gate + repository defense in depth.
- See [`JOB_SOURCE_REGISTRY.md`](./JOB_SOURCE_REGISTRY.md).

## Phase 6 — Matching engine

- Score model (weighted skill overlap + experience/location/salary).
- Score `breakdown` populated so the UI can explain "why this score".
- Per-user match feed.

## Phase 7 — Applications

- Application tracker UI.
- Status transitions write to `application_events`.
- Interview stage board.

## Phase 8 — Notifications

- Web Push registration + `push_subscriptions`.
- Server worker: watches `job_matches`, respects
  `notification_preferences` and quiet hours.
- In-app notification inbox.

## Phase 9 — PWA / offline hardening

- Service worker with careful caching (shell + last feed snapshot).
- Offline empty-state pattern.
- Background sync for saved jobs where supported.

## Phase 10 — Production QA

- Full accessibility audit.
- Performance budgets & Lighthouse gates.
- Load test on ingestion pipeline.
- CSP hardening (deferred from Phase 0 pending Supabase / analytics origins).
