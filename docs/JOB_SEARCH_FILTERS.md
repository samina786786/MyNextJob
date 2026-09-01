# Job search & filters (Phase 5D)

Catalog discovery for the fresh 30-day window. Users type a query and
apply a small set of filters; the URL is the source of truth so state is
shareable, restorable, and back-button-safe.

Phase 5D is **not personalized matching**. It ranks by freshness only,
never by resume relevance. Phase 6 owns match scores and personalized
sorting.

See also [`JOB_FEED_UI.md`](./JOB_FEED_UI.md).

## Contract (one parser to bind them all)

```
src/lib/jobs/feed/filters.ts
  parseFeedFilters(URLSearchParams | Record<string,string>): FeedFilters
  feedFiltersToSearchParams(FeedFilters): URLSearchParams
  feedFiltersCacheKey(FeedFilters): string
```

Used by the server initial-page render, `GET /api/jobs/feed`, the shared
cache key, and the client URL builder. There is no second parser.

## URL surface

```
/home?q=react&work=remote,hybrid&employment=full_time&location=India&age=7
```

| Param | Type | Rule |
| --- | --- | --- |
| `q` | string | Trimmed, whitespace-collapsed, control-char-stripped, 2..80 chars |
| `work` | comma list | Any of `remote`, `hybrid`, `onsite` — unknown values dropped |
| `employment` | comma list | Any of `full_time`, `part_time`, `contract`, `freelance`, `internship`, `temporary` |
| `location` | string | Trimmed, 1..80 chars |
| `age` | integer | One of `1`, `7`, `14`, `30`; defaults to `30`; never above 30 |

Ordering inside a comma list is normalized (sorted, deduped) so
`work=hybrid,remote` and `work=remote,hybrid` are the **same URL**
semantically and produce the **same cache entry**. Defaults (`age=30`,
empty lists, no query, no location) are omitted from the URL.

Unknown params are silently ignored. Invalid values fall back to
defaults — the URL is user input; the parser never throws.

## What is searched

| Field | Matched by `q`? | Notes |
| --- | --- | --- |
| `jobs.title` | ✓ | Case-insensitive substring (`lower(title) LIKE`) |
| `companies.name` | ✓ | Preflight resolves matching `company_id`s; jobs filtered by `company_id IN (...)` |
| `job_skills` | ✗ | Structured skills exist as a table but ingestion does not populate them today. Documented and deferred; Phase 6 will re-visit. |
| `description_text` | ✗ | Deferred. The corpus is small, and paying for a description-search index today is not justified. |

Search is **lexical**, not semantic. There is no fake "relevance score".
The result set is decided by `q` and the filter dimensions; the order is
always `freshness_at DESC, id DESC`.

## Filter semantics

Within a dimension: **OR** (e.g. `work=remote,hybrid` → remote OR hybrid).

Across dimensions: **AND**. Example:

```
q=react work=remote employment=full_time location=India age=7
```

means:

```
title/company matches "react"
AND remote_type IN (remote)
AND employment_type IN (full_time)
AND (location_text OR city OR country ILIKE '%India%')
AND freshness_at >= now() - interval '7 days'
```

The freshness filter is **capped at 30 days** in every code path so a
user cannot widen the URL to see the historical archive.

## Server render

`/home?q=react&work=remote` server-renders **the first filtered page** —
the URL is parsed synchronously and threaded through to
`loadSharedFeedPage({ cursor: null, limit: 15, filters })` before the
HTML is sent. The browser never renders an unfiltered page and swaps
it after hydration.

## Pagination

Keyset cursor over `(freshness_at, id)` is unchanged. Filter state is
sealed into the cache key so the same cursor is only ever reused for the
same filter combination. Changing **any** filter or the query:

- discards the current cursor
- fires a page-1 request with the new filters
- aborts any in-flight page-N request from the old filter state
- discards responses that arrive out of order

## Client behavior

- **Debounce**: search input coalesces at ~250 ms. Every character does
  not become a request.
- **Abort**: an `AbortController` is created per filter change; the
  previous request is aborted. The reducer additionally guards against
  responses from a filter state that is no longer current.
- **URL sync**: search & filter updates use `router.replace(...)` so a
  typing session does not create dozens of history entries. Meaningful
  page navigations (opening a job, switching pages) still push.
- **Preserved results**: while the next filter update loads, the
  previous cards remain visible with a subtle "Updating…" polite-live
  status. No full-page spinner.
- **Filter error**: previous cards remain; an inline "Couldn't update
  jobs." card offers Retry.
- **Empty state**: contextual copy — `No fresh jobs found for "React
  Native"`, `No fresh jobs match these filters.` Never "No jobs match
  your resume."
- **Clear filters** removes work/employment/location/age but preserves
  the search query. Clearing the search separately is done through the
  search input's own `×`.

## Shared cache

`getCachedFreshJobsPage(cursor, limit, filterKey)` (`use cache` +
`cacheLife(jobsFresh)`).

Inputs that reach the cache:

- `cursor` (opaque keyset string) — validated first
- `limit` (1..30)
- `filterKey` — the stable string produced by `feedFiltersCacheKey`

Inputs that MUST NOT reach the cache: user id, email, cookies, claims,
profile, resume, preferences. `getAuthIdentity` runs outside the cached
function and gates access at the API and page-server-component layer.

Cache cardinality is bounded by the filter grammar. Malformed queries
never reach the cache (parsing normalizes them first). Cardinality is
lower still because the `filterKey` normalizes `q` to lowercase and
sorts list values.

## Database

Read path is unchanged in shape:

```sql
WHERE status = 'open'
  AND freshness_at >= now() - interval '<age> days'
  [AND remote_type = ANY($work)]
  [AND employment_type = ANY($employment)]
  [AND (lower(title) LIKE '%'||lower($q)||'%'
        OR company_id = ANY($company_ids))]
  [AND (lower(location_text) LIKE ...
        OR lower(city)         LIKE ...
        OR lower(country)      LIKE ...)]
ORDER BY freshness_at DESC, id DESC
LIMIT $n + 1;
```

Company-name search is resolved by a small preflight against
`companies.name` — trigram GIN keeps it cheap.

The runtime never issues raw SQL from the client. All filters are
`.eq`, `.in`, `.gte`, `.or`, `.ilike` PostgREST helpers. User input is
neutralized by `escapePostgrestLikeSubstring` — see the
**[Security](#security)** section below for the exact characters and
why they are dropped.

## Migration 0013

Enables `pg_trgm` and adds:

- Trigram GIN on `jobs.title` — title search (raw column, `gin_trgm_ops`)
- Trigram GIN on `companies.name` — company preflight (raw column)
- Trigram GIN on `jobs.location_text`, `jobs.city`, `jobs.country`
  (partial, `WHERE ... IS NOT NULL`) — location (raw columns)
- Partial B-tree `(remote_type, freshness_at DESC, id DESC) WHERE status='open'`
  — work-mode filtered feed

### Index / query alignment

PostgREST's `.ilike('col', pattern)` and OR-grammar `col.ilike.pat` emit
a native `col ILIKE '%value%'` predicate on the **raw** column — not
`lower(col) LIKE '%value%'`. An expression index built on `lower(col)`
would therefore not be usable by the planner for these queries, because
PostgreSQL matches expression indexes by exact expression, not by
semantic equivalence.

`pg_trgm`'s `gin_trgm_ops` operator class explicitly supports both
`LIKE (~~)` and `ILIKE (~~*)` directly on the indexed column
(PostgreSQL manual, "F.34. pg_trgm — Index Support"). A trigram GIN on
the raw column is therefore the correct index for the actual
runtime predicate.

Deliberately excluded:

- **No `search_document` tsvector column.** The catalog is small,
  single-language, and title-focused; trigram ILIKE is sufficient.
  Revisit if 5E scale reveals a real ranking need.
- **No `description_text` search index.** Description text is large
  per row; the storage cost isn't justified today.
- **No bare `employment_type` index.** Rationale:
  * The enum has 6 low-cardinality values, so any single value covers
    a large fraction of the open catalog.
  * On the current 126-row local catalog, sequential scan is faster
    than any index would be.
  * A residual-filter cost on this column is very small — the planner
    can evaluate `employment_type = ANY($values)` cheaply row-by-row
    while the keyset order is being emitted by
    `jobs_open_freshness_id_idx`. (Note: `LIMIT` does **not**
    guarantee the working set is trimmed before filters run — the
    planner may walk more than `limit + 1` index tuples until enough
    residual predicates match. A dedicated employment index would
    still not be a clear win at this cardinality.)
  * Re-measure at Phase 5E scale (~5–10k rows); if a value like
    `employment_type='contract'` is a common filter and residual-filter
    cost becomes visible in EXPLAIN, revisit with a partial or
    composite index then.
- **No SECURITY DEFINER RPC.** The server repository builds the query
  with parameterized PostgREST helpers; the browser never speaks to
  PostgREST directly.

**Status: NOT APPLIED.** See `supabase/migrations/0013_job_search_filters.sql`
for the full DDL to review before applying.

## Query plans

### Expected purpose of each 0013 index

| Index | Query shape it supports (actual PostgREST-emitted predicate) | Planner behavior it enables |
| --- | --- | --- |
| GIN `jobs.title gin_trgm_ops` | `WHERE title ILIKE '%q%'` | Bitmap Index Scan produces candidate ctids; the freshness order is applied *afterwards* by a Sort or a merge with the freshness B-tree. |
| GIN `companies.name gin_trgm_ops` | preflight `SELECT id FROM companies WHERE name ILIKE '%q%'` | Bitmap Index Scan; result set is small (`LIMIT 200`), immediately awaited by the JS layer. |
| GIN `jobs.location_text` / `city` / `country` `gin_trgm_ops` (partial) | `WHERE location_text ILIKE '%loc%' OR city ILIKE '%loc%' OR country ILIKE '%loc%'` | BitmapOr across the three columns; combined with the keyset predicate as a residual. |
| Partial B-tree `(remote_type, freshness_at DESC, id DESC) WHERE status='open'` | `WHERE status='open' AND remote_type = ANY(...) ORDER BY freshness_at DESC, id DESC` | Index Scan that can produce rows already in keyset order for the filtered work-mode. |

`gin_trgm_ops` supports both `LIKE (~~)` and `ILIKE (~~*)` on the
indexed expression (PostgreSQL manual, pg_trgm). Because PostgREST
emits ILIKE on the raw column, the indexes are built on the raw
column — an index on `lower(col)` would not match the runtime
predicate.

Important caveat: **a GIN index does not by itself preserve the
`freshness_at DESC, id DESC` order**. When a text predicate is selective,
PostgreSQL typically chooses a `Bitmap Index Scan` + `Bitmap Heap Scan`
+ `Sort`. When a text predicate is broad, the planner may prefer to
walk the existing `jobs_open_freshness_id_idx` (from 0010) backward and
apply the text predicate as a residual filter. Which plan wins depends
on selectivity, correlation, and `random_page_cost`; the final call is
the planner's, not the migration's.

### Actual measured pre-0013 plan (local live catalog, 126 rows, 2026-09-01)

```
EXPLAIN
SELECT id, title FROM jobs
 WHERE status='open' AND title ILIKE '%engineer%'
 ORDER BY freshness_at DESC, id DESC
 LIMIT 16;

Limit  (cost=25.30..25.34 rows=16 width=54)
  ->  Sort  (cost=25.30..25.42 rows=48)
        ->  Seq Scan on jobs  (cost=…)  filter: (title ~~* '%engineer%')
```

At this scale the sequential scan is faster than any index would be.
Included as a baseline — 5E's larger catalog is where the trigram GIN
begins to pay for itself.

### Post-0013 plan — pending

Migration 0013 is **not applied** yet, so no post-0013 EXPLAIN can be
recorded here. Once it is applied we will run `EXPLAIN (ANALYZE,
BUFFERS)` against the exact predicate shape (`title ILIKE '%q%'`) and
record the actual plan and timing. Depending on selectivity we expect
either:

- a `Bitmap Index Scan on jobs_title_trgm_idx` → `Bitmap Heap Scan on
  jobs` → `Sort` → `Limit`, when the text predicate is selective; or
- an `Index Scan Backward using jobs_open_freshness_id_idx` with the
  trigram scan used as an alternative access path when the text
  predicate is broad and the freshness order is cheap to walk.

Both paths become available once 0013 is applied. If needed,
`SET LOCAL enable_seqscan = off;` will be used as a **diagnostic only**
to prove index eligibility on the tiny catalog — never as an
application setting, and never as the basis for a performance claim.
Any live measurement will be recorded here after 0013 is applied.

### Scale note

The measurements here are qualitative — the 126-row catalog does not
require an index to be fast. Indexes matter starting at ~5–10k rows,
which is Phase 5E's scale target.

## Security

- Every filter value is normalized before it reaches the cache or the DB.
- `q` and `location` are trimmed, whitespace-collapsed, control-char-stripped,
  and length-capped (80 chars).
- Enum values are validated against a fixed allowlist; unknown values
  are dropped.
- Cursor stays the pre-existing base64url `iso|uuid` format, decoded
  before the cache dictionary.
- The runtime uses PostgREST helper methods; there is no template-string
  SQL. `escapePostgrestLikeSubstring` neutralizes **two** independent
  layers of grammar that reach PostgreSQL through an `ILIKE` filter:
  - **PostgREST URL grammar** — `,` is the OR separator, `(` / `)` group
    `and(...)` / `not(...)` predicates, and `*` is the URL-safe alias
    for `%`. Left in place these could widen the filter grammar.
  - **SQL LIKE grammar** — `%` matches any run of characters, `_`
    matches exactly one character, and `\` is PostgreSQL's default
    LIKE escape character. PostgREST does **not** strip them, so a raw
    `%` from user input reaches PostgreSQL as a wildcard (`50%`
    otherwise silently matches "50 anything"; `_data` matches `Xdata`).
    We do not currently have access to `LIKE ... ESCAPE '<char>'`
    through PostgREST helpers, so instead of trying to escape these we
    drop them: every one of the seven characters is replaced with a
    single space, whitespace runs are collapsed, and ends are
    trimmed. Behaviour is deterministic — the same input always
    produces the same pattern.
  - Every other character (Unicode letters, digits, quotes,
    punctuation, dashes) is preserved verbatim.
- The browser never calls Greenhouse / Lever / Ashby / WWR. It only
  calls `/api/jobs/feed`.

## Attribution

Direct employer ATS (Greenhouse / Lever / Ashby) surfaces as
`<CompanyName> Careers` — the implementation provider is a technical
detail. Aggregators keep their own brand: WWR renders as `We Work
Remotely`. When a canonical job has both, direct evidence wins for
display; all provenance rows stay in `job_source_postings`.

## Logo layering fix

`CompanyLogoTile` previously kept the initials fallback rendered
underneath the loaded logo. Marks with transparent regions (Dscout)
showed a stray fallback letter through the artwork. The fix hides the
fallback layer entirely once the image reports `onLoad`, with
`aria-hidden="true"` and both `invisible` + `opacity-0` so browsers
that do not honor the visibility toggle mid-transition still hide it.
On `onError` the initials come back automatically.

## Known deferrals

- Personalized matching / scores → **Phase 6**
- Saved jobs behavior → **Phase 7**
- Application tracking → **Phase 7**
- Notifications → **Phase 8**
- Additional source registry / cron → **Phase 5E**
- Scheduled cache invalidation on sync completion → **Phase 10**
- Full-text `description_text` search → deferred; revisit at 5E scale
- `job_skills`-backed structured search → deferred; awaits ingestion
  populating `job_skills`
