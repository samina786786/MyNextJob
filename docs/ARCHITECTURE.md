# Architecture

## Stack (Phase 0)

| Layer            | Choice                                                         |
| ---------------- | -------------------------------------------------------------- |
| Framework        | **Next.js 16.3.3** (App Router, Active LTS) + **React 19**     |
| Runtime          | **Node.js ≥ 22** (`.nvmrc` pins 22)                            |
| Styling          | **Tailwind CSS v4** via `@tailwindcss/postcss`                 |
| Tokens           | `@theme` block in `src/app/globals.css` — no `tailwind.config.*` |
| Components       | Clay primitives + **shadcn/ui** (`components.json`, add on demand) |
| Typography       | **Geist Sans / Mono** via the `geist` package                  |
| Motion           | `motion/react`                                                 |
| Backend          | Supabase (`@supabase/ssr` + `@supabase/supabase-js`)           |
| Validation       | Zod at trust boundaries                                        |
| Lint             | ESLint 9 flat config — `pnpm lint` → `eslint .`                |
| Unit tests       | Vitest                                                         |
| E2E              | Playwright                                                     |

Never downgrade Next.js off the current Active LTS without explicit
written authorization. `next lint` was removed in Next.js 16 and must
not be reintroduced.

## Frontend

Next.js App Router with **Server Components by default**. Client Components
are opted into explicitly with `"use client"` and are used only for:

- interactive state (e.g. filter chip selection)
- Motion-driven interactions
- browser APIs / event handlers
- browser-side Supabase access

The shell (`src/app/layout.tsx`) provides:

- Warm-ivory background and Geist font tokens
- A centered mobile container (`max-w-2xl`) with safe-area padding
- A "skip to content" link for keyboard users
- The fixed `ClayNav` bottom navigation

Design tokens live in `src/app/globals.css` as Tailwind v4 `@theme`
custom properties. Every color, radius, shadow, and clay depth is a
token; components use semantic utilities (`bg-surface-raised`,
`text-primary-deep`, `shadow-clay-raised`) — never raw hex.

## Accessibility primitives

- `ClayButton`, `ClayIconButton`, `ClayChip` wrap a native `<button>`
  (via `motion.button`).
- `ClayInput` wraps a native `<input>`.
- `ClayNav` uses Next.js `<Link>` (`<a>`).
- Complex overlays (dialog, select, dropdown, sheet, popover, tooltip)
  must be added with `pnpm dlx shadcn@latest add …` so they ship with
  Radix accessibility. Do not hand-roll focus traps or listboxes.

## Server / client boundary

| Concern              | Where it lives                                                      |
| -------------------- | ------------------------------------------------------------------- |
| Session refresh      | `src/proxy.ts` → `src/lib/supabase/proxy.ts` (`getClaims()`, cookie `setAll` + cache headers) |
| RSC data fetching    | `src/lib/supabase/server.ts` (`getAll`/`setAll` cookies)            |
| Client interactions  | `src/lib/supabase/client.ts` (browser client)                       |
| Trusted mutations    | Route Handlers / Server Actions using the server client             |
| Privileged workers   | Server-only `SupabaseJobStore` with `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_*`) |

There is deliberately **no** `middleware.ts`. Next.js 16 uses
`src/proxy.ts`. That file only refreshes the session. Login walls live
on protected Server Component layouts via `getAuthIdentity()` /
`requireAuth()` (`getClaims()`, not `getSession()`).

`?next=` is sanitized by `sanitizeNext()` — only allow-listed internal
paths (`/home`, `/profile`, `/saved`, `/search`, `/activity`, `/onboarding`).

Auth feature code: `src/features/auth/`. Dashboard setup:
[`AUTH.md`](./AUTH.md).

The publishable (anon) key is safe to expose in the browser because every
table is protected by RLS. The service_role key **never** appears in any
`NEXT_PUBLIC_*` variable and is only introduced in later phases.

Do **not** reintroduce `@supabase/auth-helpers-nextjs` or the deprecated
`get` / `set` / `remove` cookie trio.

## Supabase architecture

- **Auth**: Supabase Auth, email + password (Phase 1). Profile rows are
  provisioned by `0002_auth_profile_provisioning.sql`. OAuth is later.
- **Database**: Postgres schema in `supabase/migrations/0001_initial_schema.sql`, plus `0002` (profile trigger), `0003` (Data API grants), `0004` (skill seed, freelance employment, match-score default 75), `0005` (job engine: `job_source_postings`, lifecycle columns, sync metrics).
- **Storage**: private `resumes` bucket (PDF/DOCX only, 10 MB), owner-scoped RLS on `storage.objects`. Browser upload to `{user_id}/{uuid}.ext`. Parsing is Node-only (`unpdf` + `mammoth`); see [`PROFILE_RESUME.md`](./PROFILE_RESUME.md).
- **Edge Functions**: reserved for later phases (ingestion, notifications).

See [`DATABASE.md`](./DATABASE.md) for tables and relationships.

## Job Engine (Phase 3)

Every source implements `JobSourceAdapter` and returns
`NormalizedJobInput` jobs plus `snapshotComplete`. Adapters fetch and
map only. They never write to the database. Pagination stays inside the
adapter; the engine does not understand provider pages.

Pipeline: adapter → validate → normalize → sanitize → fingerprint →
conservative dedupe → canonical `jobs` row + `job_source_postings`
evidence → `source_sync_runs` metrics.

`jobs.fingerprint` is a duplicate **candidate**, not a unique key.
`(source_id, external_id)` on `job_source_postings` is the idempotent
source identity. See [`JOB_ENGINE.md`](./JOB_ENGINE.md).

Phase 3 ships a synthetic adapter, `MemoryJobStore` for tests, and
`SupabaseJobStore` for production persistence. Phase 4A–4C add
Greenhouse, Lever, and Ashby. Phase 4D adds We Work Remotely RSS as
the first aggregator source. See
[`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md),
[`JOB_SOURCE_LEVER.md`](./JOB_SOURCE_LEVER.md),
[`JOB_SOURCE_ASHBY.md`](./JOB_SOURCE_ASHBY.md), and
[`JOB_SOURCE_WE_WORK_REMOTELY.md`](./JOB_SOURCE_WE_WORK_REMOTELY.md).

Phase 5A adds the 30-day active catalog, `staleSkipped` admission, a
keyset feed read model, and a content-hash sync fast path. See
[`JOB_FEED_FOUNDATION.md`](./JOB_FEED_FOUNDATION.md). Phase 5B is the
visual feed, infinite scroll, and job detail. See
[`JOB_FEED_UI.md`](./JOB_FEED_UI.md). Phase 5C adds a shared company
logo pipeline (admin CLI + self-hosted WebP). Discovery never runs on
the user request path. See [`COMPANY_ASSETS.md`](./COMPANY_ASSETS.md).
Phase 5D adds URL-persisted lexical search (`q`) and filters (work
mode, employment type, location free-text, freshness age) over the
fresh catalog. One canonical parser (`parseFeedFilters`) drives the
server initial page render, `GET /api/jobs/feed`, the shared cache
key, and the client URL builder. Debounce + AbortController prevent
stale responses from overwriting newer ones; changing any filter
invalidates the current cursor. See
[`JOB_SEARCH_FILTERS.md`](./JOB_SEARCH_FILTERS.md).

## Normalized job model

`NormalizedJobInput` is the adapter contract. Canonical rows in `jobs`
store title, company, location, `remote_type`, `employment_type`,
experience, salary, sanitized `description_html` / `description_text`,
`published_at` / `discovered_at` / `last_seen_at`, and a SHA-256
`fingerprint` (company + title + location + employment). Fingerprint is
**not unique**. Per-source evidence lives on `job_source_postings`.

## Matching pipeline (Phase 6)

Conceptual flow:

```
resume_skills  ─┐
                ├─▶ scorer ─▶ job_matches (0–100, with breakdown JSON)
job_skills    ─┘
```

The scorer is intentionally simple to start with (weighted skill overlap +
experience/location/salary bonuses) and will evolve — the score `breakdown`
column exists so the UI can explain matches without recomputing them.

## Notification architecture (Phase 8)

- `push_subscriptions` stores per-user Web Push endpoints.
- `notification_preferences` scopes what a user wants to be told about.
- A server worker watches `job_matches` for scores above the user's
  threshold and writes rows into `notifications` + delivers Web Push.
- The client renders unread notifications from `notifications` — no
  push-only state.

## What we don't build

- No global state store (React Query/RSC + URL state is enough for now).
- No microservices, message brokers, Docker, Kubernetes, Redis, or
  Elasticsearch. Next.js + Supabase carries the workload comfortably.
- No LLM/embedding calls in Phase 0–4D. Resume parsing is local.
- No LinkedIn / Naukri / Workday scraping as a core dependency.
- Greenhouse, Lever, Ashby, and WWR discovery are public GET / RSS only
  (no API keys). WWR listing HTML is never scraped.
