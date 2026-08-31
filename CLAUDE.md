# CLAUDE.md — MyNextJob project rules

Read this before touching any code in this repo. Every future Claude
session inherits these rules.

## Product

**MyNextJob** — "Your next opportunity starts here."

Mobile-first, installable job-search PWA that discovers fresh jobs from
company ATS/career systems and public feeds, matches them against the
user's resume, and notifies them when strong matches appear.

## Non-negotiable visual identity

- **Extensive claymorphism.** Clay is the primary design language, not an
  accent. Job cards, nav, buttons, chips, inputs, badges, and floating
  controls all read as soft, tactile clay.
- **Emerald-led palette** on **warm ivory** surfaces. Charcoal text.
- **Not glassmorphism.** No expensive `backdrop-filter: blur` as the main
  technique. No neon glows, harsh shadows, or heavy borders.
- **No blue** as the primary application color.
- **Mobile-first.** Target `360–430px` viewports. No horizontal scroll.
- **Buttery smooth.** Tactile Motion (`motion/react`), respects
  `prefers-reduced-motion`, animates `transform`/`opacity` only.
- **Long-form reading surfaces stay calmer.** Future job descriptions must
  not drown in clay treatment.

## Engineering invariants

- **Next.js App Router** on the current stable Active LTS line
  (**Next.js 16.x, React 19**). Never downgrade the framework without
  explicit written authorization.
- **Node.js ≥ 22** — declared in `package.json#engines` (resume parsing
  and the Job Engine require Node 22).
- **Strict TypeScript**, **Server Components by default**. `"use client"`
  only when there's a real need.
- **Tailwind CSS v4** using `@tailwindcss/postcss` and the `@theme` block
  in `src/app/globals.css`. There is **no** `tailwind.config.*` file and
  **no** `autoprefixer`. Tokens live in CSS, not JS.
- **shadcn/ui** is configured (`components.json`); complex accessible
  primitives — dialog, select, dropdown, tooltip, popover, sheet — must be
  added via `pnpm dlx shadcn@latest add …` and never hand-rolled. Do not
  invent custom focus traps, portals, or listbox keyboard behavior.
- **Native `<button>` / `<input>` / `<a>` are still the baseline.** Clay
  primitives wrap them (`ClayButton`, `ClayIconButton`, `ClayInput`,
  `ClayChip`, `ClayNav`). Do not swap a working native control for a
  Radix/shadcn abstraction just for consistency.
- **ESLint** runs directly (`pnpm lint` → `eslint .`). `next lint` was
  removed in Next.js 16 and must not come back. Config is flat
  (`eslint.config.mjs`).
- **Typography** is Geist Sans (and optionally Geist Mono for data /
  code surfaces) via the `geist` package. No stand-in fonts.
- **Supabase** backend via `@supabase/ssr` **0.12.x**. Use the modern
  `getAll` / `setAll` cookie adapter. `setAll(cookies, headers)` is
  required — copy the official `Cache-Control`, `Expires`, and `Pragma`
  values onto the outgoing Next.js response so session-refresh responses
  stay private/non-cacheable. Do NOT reintroduce
  `@supabase/auth-helpers-nextjs`, the deprecated `get`/`set`/`remove`
  cookie trio, or the old one-argument `setAll`.
- **Next.js `proxy.ts` convention.** `src/proxy.ts` is a thin entry that
  calls `src/lib/supabase/proxy.ts` to refresh the cookie session. There
  is deliberately no `middleware.ts`. Proxy must stay lightweight — no
  database or profile queries, no complete authorization.
- **Trusted identity** uses `supabase.auth.getClaims()` on the server.
  Do not authorize from `getSession()`. Protected layouts also verify
  identity; Proxy is not the security boundary.
- **Auth is email + password only** (signup, confirm, sign-in, reset,
  sign-out). Do not add OAuth, magic-link-only, or phone auth unless a
  later phase asks for it. `?next=` must go through `sanitizeNext()`.
- **RLS is required** on every user-owned table. Never rely on client-side
  filtering for security.
- **Private resumes.** The `resumes` storage bucket is private; paths are
  `{user_id}/…`; access via signed URLs only. V1 accepts **PDF and DOCX
  only** — no `.doc`, no `.txt`.
- **Normalized job architecture.** All source adapters must produce one
  unified `Job` shape — frontend must never depend on Greenhouse-,
  Lever-, or Ashby-specific response shapes.
- **No LinkedIn / Naukri / Workday scraping** as a core dependency.
- **No global state** libraries (Redux, Zustand, Jotai, …) unless a real
  need appears in a later phase.
- **No secrets in `NEXT_PUBLIC_*`.** The service_role key is server-only.
- **Avoid unnecessary dependencies.** Prefer stdlib and Next primitives.

## Development workflow

Before every future task:

1. Inspect the relevant existing files first.
2. Understand the current architecture — don't rewrite what already works.
3. Make minimal, scoped changes.
4. Preserve working behavior.
5. Run validation: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
6. Summarize what changed and what didn't.
7. Report remaining issues honestly.

## Scope control

- Do **not** implement work from later phases unless explicitly instructed.
- Phase 5A (feed foundation) is implemented. Do not add matching,
  notifications, application UX, job-feed UI, cron, or AI unless a
  later phase asks for it.
- Phases: 0 Foundation · 1 Auth · 2 Profile+Resume · 3 Job Engine ·
  4 Sources · 5 Discovery UI (5A feed foundation · 5B UI · 5C logos ·
  5D search · 5E source registry) · 6 Matching · 7 Applications ·
  8 Notifications · 9 PWA/Offline · 10 Production QA.

## Resume parsing (Phase 2 invariants)

- Resume parsing is **server-side only** (Node runtime, `server-only`,
  never imported into Client Components).
- V1 accepts **PDF and DOCX only**, **10 MB max**.
- Private `resumes` Storage only. Object paths are `{user_id}/{uuid}.ext`.
- **No public resume URLs.** Signed URLs are short-lived and not stored.
- No third-party resume parser, OCR, or paid AI API without explicit
  written approval. Extraction is local (`unpdf` + `mammoth` raw text).
- Extracted profile data is always user-reviewable. **Manual edits beat
  parser suggestions.** Never silently overwrite confirmed profile fields.
- Canonical `skills` ids beat free-text duplicates.
- Never log resume contents, emails, or file bytes.
- No OCR in V1. Scanned PDFs should fail with a helpful warning.

## Job Engine (Phase 3 invariants)

- Every external job source must implement `JobSourceAdapter`. Adapters
  fetch and map only — they never write to the database.
- Frontend never consumes provider-specific payloads (no Greenhouse /
  Lever / Ashby field names). The engine contract is `NormalizedJobInput`.
- Source identity is `(source_id, external_id)` on `job_source_postings`.
  That pair is unique and is the first idempotency layer.
- `jobs.fingerprint` is a duplicate **candidate**, not a unique identity.
  Two legitimate openings may share company + title + location.
- Preserve source provenance. One canonical job may have 1..N source
  postings. Do not drop `jobs.source_id` / `jobs.external_id`; they are
  original-source compatibility fields.
- Sanitize all external job HTML server-side (`sanitize-html`). Never
  trust raw apply/source URLs — HTTP/HTTPS only.
- A source sync failure must never mass-close jobs. Only **complete**
  snapshots increment missing-job lifecycle counters.
- Ingestion writes remain server/backend-only. Use `SUPABASE_SECRET_KEY`
  (never `NEXT_PUBLIC_*`). Phase 3 unit tests use an in-memory store and
  do not require the secret. `SupabaseJobStore` is the production
  persistence contract for Phase 4 adapters.
- Do not add `synthetic` to the live `source_type` enum.
- See [`docs/JOB_ENGINE.md`](docs/JOB_ENGINE.md).

## Greenhouse discovery (Phase 4A invariants)

- Greenhouse discovery uses the **public GET** Job Board API only.
  Hostname is fixed: `https://boards-api.greenhouse.io`.
- **No Greenhouse API key** for discovery. Do not send Authorization,
  Basic Auth, Supabase secrets, or cookies to Greenhouse.
- Board token comes from `job_sources.external_identifier`. Never
  hard-code company tokens in adapter logic.
- Greenhouse `id` is the source-posting identity (`externalId` string).
  `internal_job_id` is metadata only (null is valid for prospect posts).
- `updated_at` must not masquerade as `published_at`. Phase 4A leaves
  `publishedAt` null unless a genuine first-published value exists.
- Ingest the **full** public board snapshot. Do not filter by candidate
  skills, location preference, or resume inside the adapter.
- Greenhouse `content` always passes through the generic Phase 3
  sanitizer. Do not add a second sanitizer or a Greenhouse table.
- See [`docs/JOB_SOURCE_GREENHOUSE.md`](docs/JOB_SOURCE_GREENHOUSE.md).

## Lever discovery (Phase 4B invariants)

- Lever discovery uses the **public Postings API v0** only.
- **No Lever API key** for GET discovery. Never implement Lever
  application POST during ingestion.
- Site identifier comes from `job_sources.external_identifier`.
- Instance must be controlled `metadata.lever_instance` = `global` | `eu`.
  Never use an arbitrary metadata URL as the request host.
- The adapter owns `skip`/`limit` pagination. Only naturally completed
  pagination is a complete snapshot. Safety caps force incomplete.
- Lever `id` is the source-posting identity (`externalId` string).
- `workplaceType` beats inferred work mode. Unknown commitment stays
  unknown. `publishedAt` is not invented.
- Descriptions (`description` + `lists` + `additional`) always pass
  through the generic Phase 3 sanitizer. Fetch the full site snapshot.
- No Lever-specific database schema.
- See [`docs/JOB_SOURCE_LEVER.md`](docs/JOB_SOURCE_LEVER.md).

## Ashby discovery (Phase 4C invariants)

- Ashby discovery uses the **public Job Posting API** only.
  Hostname is fixed: `https://api.ashbyhq.com`.
- **No Ashby credential** for public discovery. Do not send
  Authorization, Basic Auth, cookies, or Supabase secrets to Ashby.
  Do not create `ASHBY_API_KEY`. Authenticated Ashby APIs
  (`jobPosting.list`, `application.create`, …) are not used.
- Board name comes from `job_sources.external_identifier`. Never
  hard-code board names inside adapter logic.
- Only publicly listed postings are ingested (`isListed !== false`).
  Unlisted rows are skipped, not rejected.
- Explicit posting `id` is the preferred source identity. A validated
  `jobs.ashbyhq.com/{board}/{uuid}` path may be used only as fallback.
  Never invent identity from title / company / location.
- `workplaceType` beats `isRemote` and location-text inference.
- `publishedAt` is the authoritative publication timestamp. Do not
  replace it with `discovered_at`.
- Structured `employmentType` is authoritative. Unknown values stay
  unknown → NULL.
- Compensation must not mix salary with equity or bonus. Ambiguous
  multiple salary tiers stay canonical NULL.
- External descriptions always use the generic Phase 3 sanitizer.
  Do not add an Ashby-specific sanitizer.
- Ingest the **full listed board** snapshot in one request. Do not
  filter by candidate skills, location preference, or resume. Do not
  invent pagination.
- No Ashby-specific database tables.
- See [`docs/JOB_SOURCE_ASHBY.md`](docs/JOB_SOURCE_ASHBY.md).

## We Work Remotely discovery (Phase 4D invariants)

- WWR ingestion uses the official public RSS feed only:
  `https://weworkremotely.com/remote-jobs.rss`.
- Never scrape WWR listing pages for discovery. No Playwright,
  Puppeteer, or HTML crawlers.
- Preserve WWR attribution. `sourceUrl` (and Phase 4D `applyUrl`) stay
  on the canonical WWR job URL.
- WWR is a publisher, not the canonical employer. Do not insert a
  We Work Remotely row into `companies`. `job_sources.company_id` is
  NULL. Each RSS item supplies the real employer; canonical jobs
  resolve through generic company resolution. Fixed ATS sources still
  use their configured company.
- Company matching is conservative and never fuzzy. No invented domains.
- GUID is the preferred source identity. A validated WWR listing URL is
  the only fallback.
- `remoteType = remote` does not mean worldwide. Preserve region/country
  restrictions.
- `pubDate` is the publication timestamp. Do not replace it with
  `discovered_at`.
- Descriptions use the generic Phase 3 sanitizer.
- Ingest the complete global feed. Do not filter by candidate skills.
  Do not simultaneously ingest category feeds.
- `snapshotComplete` requires evidence that the feed is a full active
  snapshot. Live RSS is incomplete, so WWR snapshots stay incomplete.
- No WWR-specific job tables.
- See [`docs/JOB_SOURCE_WE_WORK_REMOTELY.md`](docs/JOB_SOURCE_WE_WORK_REMOTELY.md).

## Feed foundation (Phase 5A invariants)

- MyNextJob is not a historical job archive.
- Default active catalog window is **30 days**.
- Trusted `published_at` controls freshness when available.
- `discovered_at` is the fallback when publication time is unavailable.
- Do not invent `published_at` for Greenhouse/Lever.
- Stale source items are not malformed; they are `staleSkipped`.
- The stale gate runs before dynamic company creation and persistence.
- Feed queries always enforce freshness; cleanup is not a prerequisite.
- Stale user-referenced jobs (`saved_jobs`, `applications`, `job_matches`,
  `notifications`) are preserved.
- Keyset/cursor pagination only. No large OFFSET feeds.
- Default feed page size 15, maximum 30.
- One canonical job appears once regardless of source posting count.
- No `raw_payload`, fingerprint, or content hash in the user-facing read
  model.
- Ingestion performance optimizations must stay provider-neutral.
- Content-hash unchanged fast path is preferred.
- No cron yet.
- See [`docs/JOB_FEED_FOUNDATION.md`](docs/JOB_FEED_FOUNDATION.md).

## When in doubt

- Prefer clear code over clever code.
- No comments narrating obvious React. Comment *why*, not *what*.
- No magic hex colors in components — use semantic tokens.
- No premature abstractions or "enterprise" architecture.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
