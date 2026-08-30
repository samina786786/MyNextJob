# MyNextJob

> Your next opportunity starts here.

MyNextJob is a mobile-first, installable job-search PWA. It discovers fresh
jobs from company ATS/career systems and public feeds, matches them against
your resume, and notifies you the moment your next opportunity appears.

**Current phase: Phase 4B — Lever Postings API source.**
The Phase 3 Job Engine is live. Greenhouse and Lever public boards
ingest through the same adapter contract. See
[`docs/JOB_SOURCE_GREENHOUSE.md`](docs/JOB_SOURCE_GREENHOUSE.md) and
[`docs/JOB_SOURCE_LEVER.md`](docs/JOB_SOURCE_LEVER.md).
`/home` remains the Phase 2 profile-ready experience — ingested jobs
are not shown to users yet.

## Stack

- **Next.js 16** (App Router) + **React 19**
- Strict **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/postcss`, `@theme` in CSS — no `tailwind.config.*`)
- **shadcn/ui** wired up via `components.json` (components added on demand)
- **Motion** (`motion/react`) for tactile interactions
- **Geist Sans / Mono** via the `geist` package
- **Lucide React** icons
- **Supabase** (Postgres, Auth, Storage) via `@supabase/ssr`
- **Zod** at trust boundaries
- **ESLint 9 flat config** — run via `eslint .`, not `next lint`
- **Vitest** (unit) + **Playwright** (E2E)
- **pnpm**

## Prerequisites

- **Node.js 22+** (enforced via `package.json#engines`; `.nvmrc` pins
  Node 22)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@latest --activate`)
- A [Supabase](https://supabase.com) project with Email/Password enabled
  (see [`docs/AUTH.md`](docs/AUTH.md)). The UI still renders without
  credentials; sign-in will explain that auth is not connected.

## Installation

```bash
pnpm install
cp .env.example .env.local  # then fill in your Supabase project values
```

Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SITE_URL` to the
origin you listed in the Supabase redirect allow-list (localhost in
development). Dashboard email-template steps are documented in
[`docs/AUTH.md`](docs/AUTH.md) and cannot be applied from this repo.

## Development

```bash
pnpm dev              # Next.js dev server at http://localhost:3000
pnpm lint             # ESLint 9 flat config (eslint .)
pnpm lint:fix         # ESLint --fix
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest unit tests (single run)
pnpm test:watch       # Vitest in watch mode
pnpm build            # production build
pnpm start            # serve the production build
pnpm test:e2e         # Playwright smoke suite
pnpm jobs:synthetic   # In-memory Job Engine exercise (no live DB)
pnpm jobs:greenhouse --source=dscout --dry-run  # Greenhouse fetch, no writes
pnpm jobs:lever --source=drivetrain --dry-run   # Lever fetch, no writes
```

Playwright browsers must be installed once:

```bash
pnpm test:e2e:install
```

## Adding shadcn/ui components

The project is initialized (`components.json`), so:

```bash
pnpm dlx shadcn@latest add dialog select dropdown-menu tooltip popover sheet
```

Components land in `src/components/ui/`. They must consume the semantic
clay tokens (`bg-surface-raised`, `text-primary-deep`, …); never patch a
raw hex into a shadcn component.

## Regenerating PWA icons

`public/icons/icon-source.svg` is the canonical mark. Regenerate every
PNG variant and the favicon:

```bash
node scripts/generate-icons.mjs
```

## Project structure

```text
src/
├── app/                     # App Router routes
│   ├── (public)/            # Landing (`/`)
│   ├── (auth)/              # Sign-in, sign-up, reset
│   ├── (app)/               # Protected app (auth layout)
│   │   ├── (shell)/         # `/home`, `/profile` with bottom nav
│   │   └── onboarding/      # Resume → profile → preferences
│   ├── auth/confirm         # Email OTP verification
│   ├── auth/callback        # PKCE code exchange
│   ├── design-system/       # Internal visual QA
│   ├── globals.css          # Tailwind v4 @theme + clay utilities
│   ├── layout.tsx           # Geist, skip-link
│   └── manifest.ts          # PWA manifest
├── components/
│   ├── clay/                # Reusable clay primitives
│   ├── ui/                  # shadcn/ui lands here (added on demand)
│   ├── home/                # Home-preview client bits
│   └── jobs/                # SampleJobCard (visual-only)
├── features/auth/           # Actions, schemas, safe redirects, forms
├── features/onboarding/     # Resume upload, profile review, preferences
├── lib/
│   ├── supabase/            # Browser / server client + session refresh
│   ├── auth/                # getClaims() identity helpers
│   ├── jobs/                # Job Engine (adapters, normalize, persist, sync)
│   ├── resume/              # Local PDF/DOCX parse + validation
│   ├── onboarding/          # Progress derivation + queries
│   ├── skills/              # Canonical taxonomy seed list
│   └── validation/          # Zod schemas used at trust boundaries
└── proxy.ts                 # Next.js 16 session-refresh entry
supabase/
└── migrations/              # 0001–0005 (schema, auth trigger, grants, skills, job engine)
scripts/
└── generate-icons.mjs       # PWA icon generator (sharp)
tests/
├── fixtures/                # Fictional Alex Candidate PDF/DOCX
├── unit/                    # Vitest
└── e2e/                     # Playwright
docs/                        # Architecture, design system, database, roadmap, profile/resume
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit
together and [`docs/DATABASE.md`](docs/DATABASE.md) for the schema.

## Supabase setup

1. Create a new Supabase project.
2. Copy the **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the **publishable (anon) key** into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. **Never** put the service_role key in any `NEXT_PUBLIC_*` variable.
5. Apply the initial migration:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```

   Or paste each file in `supabase/migrations/` into the SQL Editor, in
   order (`0001` … `0007`). Phase 2 needs `0004` for the skill catalog
   and the `freelance` employment type. Phase 3 needs `0005` for
   `job_source_postings` and job lifecycle columns. Phase 4A needs
   `0006` for curated Greenhouse companies/sources. Phase 4B needs
   `0007` for curated Lever companies/sources — review both before
   applying. Do not skip grants in `0003` / `0004` / `0005` — Data API
   auto-expose is off.

## Contributing to Phase 0

- Server Components by default; `"use client"` only when justified.
- All new UI must use semantic tokens, not raw hex.
- Do not implement Lever/Ashby/WWR, job UI, matching, or cron here.
  See [`CLAUDE.md`](CLAUDE.md).
