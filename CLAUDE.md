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
- **Node.js ≥ 20.9** — declared in `package.json#engines`.
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
- Phase 1 (Authentication) is implemented. Do not add resume upload,
  onboarding, job ingestion, or matching here.
- Phases: 0 Foundation · 1 Auth · 2 Profile+Resume · 3 Job Engine ·
  4 Sources · 5 Discovery UI · 6 Matching · 7 Applications ·
  8 Notifications · 9 PWA/Offline · 10 Production QA.

## When in doubt

- Prefer clear code over clever code.
- No comments narrating obvious React. Comment *why*, not *what*.
- No magic hex colors in components — use semantic tokens.
- No premature abstractions or "enterprise" architecture.
