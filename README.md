# MyNextJob

> Your next opportunity starts here.

MyNextJob is a mobile-first, installable job-search PWA. It discovers fresh
jobs from company ATS/career systems and public feeds, matches them against
your resume, and notifies you the moment your next opportunity appears.

**Current phase: Phase 1 — Authentication.** Email + password signup,
confirmation, sign-in, reset, and sign-out. No resume upload, matching,
or job ingestion yet. See [`docs/ROADMAP.md`](docs/ROADMAP.md) and
[`docs/AUTH.md`](docs/AUTH.md).

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

- **Node.js 20.9+** (enforced via `package.json#engines`; `.nvmrc` pins
  Node 22, the current supported LTS used in development)
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
│   ├── (app)/home/          # Protected `/home`
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
├── lib/
│   ├── supabase/            # Browser / server client + session refresh
│   ├── auth/                # getClaims() identity helpers
│   └── validation/          # Zod schemas used at trust boundaries
└── proxy.ts                 # Next.js 16 session-refresh entry
supabase/
└── migrations/              # 0001 + 0002 (profile provisioning) + RLS
scripts/
└── generate-icons.mjs       # PWA icon generator (sharp)
tests/
├── unit/                    # Vitest
└── e2e/                     # Playwright
docs/                        # Architecture, design system, database, roadmap
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

   Or paste `supabase/migrations/0001_initial_schema.sql` into the SQL
   editor. The migration also creates the private `resumes` storage bucket
   (PDF/DOCX only, 10 MB cap) with owner-only object policies.

## Contributing to Phase 0

- Server Components by default; `"use client"` only when justified.
- All new UI must use semantic tokens, not raw hex.
- Do not implement features from Phases 1+ here. See [`CLAUDE.md`](CLAUDE.md).
