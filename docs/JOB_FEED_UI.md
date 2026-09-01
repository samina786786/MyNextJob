# Job feed UI (Phase 5B)

Production browsing of the Phase 5A active catalog. Users open Home,
see the first 15 fresh jobs immediately, and load more by scrolling.
Ingestion is independent: scrolling never calls Greenhouse, Lever,
Ashby, or We Work Remotely.

See also [`JOB_FEED_FOUNDATION.md`](./JOB_FEED_FOUNDATION.md).

## Server-first initial load

Authenticated `/home` resolves auth and onboarding **outside** the
shared cache. There is **no** route-level `loading.tsx`. The page chrome
is synchronous:

- MyNextJob brand
- greeting / profile summary (own Suspense; time-of-day fallback)
- **Fresh jobs**
- “Latest opportunities from the active catalog.”

Only `<HomeJobsFeed>` / `<JobsFeedSection>` sits behind the job-card
skeleton boundary (5 geometry-matching cards). The app layout
`RouteSuspense` fallback is a generic pulse, not a job-feed skeleton, so
`/profile` and onboarding do not look like Home.

1. `requireAuth` / profile greeting (request-specific)
2. `loadSharedFeedPage({ cursor: null, limit: 15 })`
3. HTML includes up to 15 cards
4. Client `JobsFeed` hydrates with that page (`asOf` included)

The browser does not fetch page 1 after paint.

## Pagination

| | |
| --- | --- |
| Transport | `GET /api/jobs/feed?cursor&limit` |
| Default / max | 15 / 30 |
| Cursor | opaque keyset from 5A (`freshnessAt` + `id`) |
| Observer | `IntersectionObserver`, `rootMargin: 0px 0px 1000px 0px` |
| Fallback | native **Load more jobs** button |
| Concurrency | one in-flight cursor; `AbortController` on unmount |
| Dedupe | append by `job.id` |

Response:

```json
{
  "items": [ { "id": "…", "title": "…", "companyName": "…" } ],
  "nextCursor": "… or null",
  "hasNextPage": true,
  "asOf": "2026-09-01T00:00:00.000Z"
}
```

No `COUNT(*)`. No `description_html` / `description_text` on cards.
The extra database row used to detect `hasNextPage` is not returned.

Unauthenticated → **401**. Invalid cursor/limit → **400**. Failures →
generic **500**. HTTP `Cache-Control: private, no-store`.

## Shared vs personal caching

`cacheComponents: true` with profile `jobsFresh` in `next.config.mjs`.
Next.js 16.3 Cache Components forbids route segment `dynamic` and
`runtime` exports; cookies/params must sit under `<Suspense>`.
Authenticated pages stay request-specific. The catalog functions use
`"use cache"` + `cacheLife({ stale: 60, revalidate: 60, expire: 600 })`
(same numbers as the named `jobsFresh` profile).

- stale: 60s
- revalidate: 60s
- expire: 600s

Tags (central helpers in `src/lib/jobs/feed/cache-tags.ts`):

- `jobs-feed`
- `company-assets`
- `job:<jobId>`

Cached functions (`src/lib/jobs/feed/cached.ts`) accept only `cursor` +
`limit` or a `jobId`. They use the service-role admin client and never
read cookies, claims, user id, email, profile, or resume.

`invalidateJobsFeedCache()` calls `revalidateTag('jobs-feed', 'max')`.
**CLI ingestion cannot use this.** `pnpm jobs:*` is a separate Node
process; importing `next/cache` there does not reach the running Next
server. There is no unauthenticated revalidation endpoint. The short
cache life is the Phase 5B correctness fallback. Phase 10 may connect
successful sync to a protected server-side revalidation.

Do not cache the authenticated home page as a whole.

## Card DTO

`FeedCardJob`: id, companyName, title, location/city/country,
remoteType, employmentType, structured salary fields, publishedAt,
discoveredAt, freshnessAt (ISO strings), sourceLabel.

Never: raw_payload, fingerprint, content_hash, source_id, external_id,
miss counters, descriptions, apply URLs.

## Freshness wording

| Data | Label |
| --- | --- |
| `published_at` present | `Posted …` |
| `published_at` null | `Found …` (from `discovered_at`) |

Relative time uses the page `asOf` so SSR and hydration match. No live
timer. Semantic `<time datetime="…">`.

## Attribution

One batched `job_source_postings` + `job_sources` lookup per page.
UI shows a single deterministic label: Greenhouse / Lever / Ashby
before We Work Remotely. Provenance rows are not deleted. WWR jobs
render `Source: We Work Remotely`. Posting ids are not sent to the
browser.

## Job detail

`/jobs/[id]` is protected like `/home`. Shared canonical data is cached
(`job:<id>`). If the job is missing, closed, or outside the 30-day
window: “This job is no longer in the active catalog.”

Description uses stored `description_html` (already sanitized at ingest).
Read-time `formatStoredDescription` also splits glued sentences
(`briefs.Edit` → `briefs. Edit` / `<br />`) so already-ingested rows
stay readable without a catalog rewrite. Fallback is plain
`description_text` with the same separators. Apply now uses
`apply_url`, then `source_url`, HTTP(S) only,
`rel="noopener noreferrer"`. No application rows. Provider `style` /
`class` never survive the Phase 3 sanitizer.

## Loading and errors

| State | Behavior |
| --- | --- |
| Initial | Shell + heading stay visible. 5 geometry-matching clay skeletons, delayed ~200ms so fast cache hits do not flash. |
| Next page | Existing cards stay. 2 skeletons append. |
| Next page error | Existing cards stay. Inline Retry uses the same cursor. |
| Initial error | Inline Retry (`router.refresh()`). No stack traces. |
| Empty | “No fresh jobs are available right now.” (not matching copy) |
| End | “You've reached the end of the current fresh-job catalog.” |

## Accessibility

Semantic headings, list + article cards, real links/buttons, 44px
controls, visible focus, `<time datetime>`, polite `aria-live` for
“N more jobs loaded”, keyboard Load more, no focus theft on append,
`prefers-reduced-motion` disables card enter animation.

## Company identity

Fixed 48×48 slot on cards and detail. Deterministic initials always
render. When `companyLogoUrl` is present (status `ready`), Next Image
overlays the self-hosted WebP after decode. Failed loads keep initials.
First 5 server-rendered logos may use `priority`; later cards lazy-load.
The browser never fetches company homepages or third-party logo APIs.
See [`COMPANY_ASSETS.md`](./COMPANY_ASSETS.md).

## Performance (local live catalog, 126 fresh jobs)

Read-only measurement of the first 15-job page (PostgREST, not Next cache):

| | |
| --- | --- |
| Rows returned to the client | 15 |
| Probe rows | 16 (hasNextPage detection; extra row not sent) |
| JSON body | 6,911 bytes (~6.8 KB) |
| First DB page | 1,454 ms cold (TLS + PostgREST) |
| Attribution | 197 ms, one batched query |
| Internal fields leaked | none |
| Per-card requests | none |

`"use cache"` / `jobsFresh` skips that DB work on subsequent equivalent
requests until revalidate/expire. CLI sync does not purge this cache.

## Search & filters (Phase 5D — code complete; 0013 pending)

Search (`q`), work mode, employment type, location free-text, and
freshness age (1/7/14/30 days) live on `/home`. State is URL-persisted
(`/home?q=react&work=remote,hybrid&…`) and directly server-renders the
first filtered page. Debounce ~250 ms + AbortController + a filter-
equality guard in the reducer prevent stale responses from overwriting
newer ones. Cursor is invalidated on any filter/query change; filtered
feed keeps keyset pagination. Full contract in
[`JOB_SEARCH_FILTERS.md`](./JOB_SEARCH_FILTERS.md).

Direct employer ATS attribution now surfaces as `<CompanyName> Careers`
(implementation detail — Greenhouse / Lever / Ashby — is hidden);
aggregators (WWR) keep their brand. Provenance rows in
`job_source_postings` are unchanged.

`CompanyLogoTile` transparency fix: once the logo image reports
`onLoad`, the initials fallback layer is hidden (`aria-hidden="true"`
+ `invisible` + `opacity-0`). Transparent regions of a loaded mark can
no longer reveal a stray fallback letter (Dscout regression).

## Known deferred work

- Full-text `description_text` search → deferred; revisit at 5E scale
- `job_skills`-backed structured search → deferred; awaits ingestion
- Matching / scores → 6
- Saves / applications → 7
- Notifications → 8
- Advanced PWA → 9
- Sync-triggered cache invalidation → 10
