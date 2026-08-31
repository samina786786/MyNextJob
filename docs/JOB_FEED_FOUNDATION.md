# Job feed foundation (Phase 5A)

MyNextJob is **not a historical job archive**. The active catalog is a
30-day freshness window. This phase is backend only: admission, cleanup,
a feed read model, keyset pagination, and provider-neutral sync speed.
There is no visual feed yet (Phase 5B).

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md).

## Freshness policy

Canonical freshness:

```text
freshness_at = coalesce(published_at, discovered_at)
```

`published_at` remains employer/source-reported. `discovered_at` remains
first persist time and is never overwritten.

| Age | Meaning |
| --- | --- |
| 0–14 days | Fresh (later UI band) |
| 15–30 days | Eligible, less fresh |
| >30 days | Not in the active catalog |

Greenhouse and Lever often have `published_at = null`. Those jobs are
**admitted**. Their window starts at `discovered_at`. Do not invent a
publication time.

Ashby and WWR supply trustworthy `publishedAt`. Old RSS items (2023/2024)
are `staleSkipped` at admission.

Far-future `publishedAt` (more than 24h ahead) is untrusted: admit the
job, persist `published_at = null`, and let `discovered_at` control
`freshness_at`. Do not rank it as impossibly fresh and do not stale-skip
it. Valid timestamps, including those within the 24h clock-skew window,
are stored unchanged. `0010` keeps `coalesce(published_at, discovered_at)`.

## Admission gate (`staleSkipped`)

Before company resolution, sanitization, or persistence:

1. Peek `publishedAt` from the adapter payload (no HTML sanitize)
2. If trusted `publishedAt` is older than 30 days → **staleSkipped**
3. Else `prepareNormalizedJob` and persist (hash fast path or full write)

`staleSkipped` is not `rejected`, not malformed, not a failed sync.
No company row, no canonical job, no source posting is created.

Existing stale postings still count as **seen** for source lifecycle so
WWR/Ashby omission rules stay separate from product retention.

## Feed read model

`getFreshJobsPage({ limit, cursor, filters })`

Default page size **15**, max **30**. Keyset, never large OFFSET.

Sort: `freshness_at DESC`, `id DESC`.

Eligibility (always, even before cleanup):

```text
status = 'open'
AND freshness_at >= now() - 30 days
```

Returned fields: id, company id/name, title, location_text, city, region
(null in 5A — not a `jobs` column), country, remote/employment types,
salary fields, published_at, discovered_at, freshness_at, status,
apply_url, source_url.

Never returned: raw_payload, content_hash, fingerprint, source_id,
external_id, miss counters, sync diagnostics.

One canonical job appears **once**, regardless of how many
`job_source_postings` exist. Phase 5D should load provenance via
`findPostingsByJob(jobId)` and may prefer employer ATS evidence over
aggregator evidence without dropping WWR rows.

## Cursor

Opaque `base64url` of `ISO8601|uuid`. Validated. Malformed → error.

Page 2:

```text
freshness_at < cursor.t
OR (freshness_at = cursor.t AND id < cursor.id)
```

## Cleanup

```bash
pnpm jobs:cleanup --dry-run
pnpm jobs:cleanup --apply
```

Default is dry-run. `--apply` deletes only unreferenced stale canonical
jobs. `job_source_postings` cascade. Referenced by `saved_jobs`,
`applications`, `job_matches`, or `notifications` → preserve. A stale
canonical row with another posting that still has a fresh `published_at`
→ preserve. Companies are never deleted in 5A.

WWR `snapshotComplete = false` is unchanged. Cleanup is not lifecycle.

## Index (0010)

`jobs_open_freshness_id_idx` on `(freshness_at DESC, id DESC) WHERE status = 'open'`.

Before 0010, EXPLAIN of the feed query was a sequential scan + sort
(138 rows, cost ~19.91). After 0010 cannot be measured until the
migration is applied.

## Benchmarks (same Windows + live Supabase env)

Unchanged WWR all-jobs RSS (~90 items):

| | Before 5A | After 5A |
| --- | --- | --- |
| Total | ~122–125s | **4.4s** |
| HTTP fetch | ~2–3s | 2.3s |
| Prefetch | n/a (per-job) | 345ms (90 postings) |
| Persist | ~120s sequential | 1.05s (1 batched touch) |
| Company lookups | ~90 | 0 |
| Fetched / created / updated / unchanged | 90 / 0 / 0 / 90 | 90 / 0 / 0 / 80 |
| staleSkipped | n/a | 10 |

Stretch goal (&lt;15s) met. First-run live ingest was not re-measured
(catalog already populated). New jobs still insert one canonical row and
one posting each; company resolution is cached per run.

## Authenticated grants (0010 live; 0011 pending)

Column-level `SELECT` on `jobs` for `authenticated` (0010). Hidden:
`raw_payload`, `fingerprint`, `content_hash`, `consecutive_misses`,
`closed_at`, `status_changed_at`, `source_id`, `external_id`.

`anon` has no `jobs` SELECT.

0010 revoked table-level SELECT but left the historical ALL leftovers
(`TRUNCATE`, `REFERENCES`, `TRIGGER`, and Postgres 17 `MAINTAIN`) on
`anon` / `authenticated`. [`0011_job_grant_hardening.sql`](../supabase/migrations/0011_job_grant_hardening.sql)
revokes those. It must not `REVOKE ALL` from `authenticated` on `jobs`
or the column grants disappear.

`job_source_postings` and `source_sync_runs` stay server-only (0005
`REVOKE ALL` from client roles; 0011 repeats it). `job_sources` keeps
authenticated table SELECT from 0003/0005 (catalog / later attribution);
0011 only strips unused mutation/DDL leftovers. `service_role` grants
are unchanged. RLS is unchanged.

## Sync fast path

Per source sync:

1. Prefetch all `job_source_postings` for `source_id` (paged at 1000;
   never silently truncated)
2. Per-sync `CompanyResolutionCache`
3. If posting exists and `content_hash` matches → queue last_seen touch
4. Batch `touchUnchangedSightings` (postings + jobs)
5. Else resolve company (cached) and persist as before

`content_hash` includes apply/source URLs, so a link change exits the
fast path and updates the records. Greenhouse/Lever/Ashby still pass
configured `companyId`. No cron.

## Known limits

- Live feed SQL and cleanup DELETE require 0010 (applied)
- Grant leftovers on `jobs` / `job_sources` wait on 0011
- `region` is not stored on `jobs`
- Unchanged fast path still does not rewrite URLs when the hash matches
- Orphan-company cleanup is deferred
- Matching, search, logos, and feed UI are later subphases
