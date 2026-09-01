# Job feed UI (Phase 5B)

Production browsing of the Phase 5A active catalog. Users open Home,
see the first 15 fresh jobs immediately, and load more by scrolling.
Ingestion is independent: scrolling never calls Greenhouse, Lever,
Ashby, or We Work Remotely.

See also [`JOB_FEED_FOUNDATION.md`](./JOB_FEED_FOUNDATION.md).

## Server-first initial load

Authenticated `/home` resolves auth and onboarding **outside** the
shared cache, then streams `<JobsFeedSection>` behind a section-level
Suspense boundary.

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

Description uses stored `description_html` (already sanitized). Fallback
is plain `description_text`. Apply now uses `apply_url`, then
`source_url`, HTTP(S) only, `rel="noopener noreferrer"`. No application
rows.

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

48×48 deterministic initials tile. No remote images. Phase 5C replaces
the interior of this slot.

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

## Known deferred work

- Real logos → 5C
- Search / filters → 5D
- Matching / scores → 6
- Saves / applications → 7
- Notifications → 8
- Advanced PWA → 9
- Sync-triggered cache invalidation → 10
