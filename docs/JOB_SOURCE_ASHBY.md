# Ashby Public Job Posting API source (Phase 4C)

Ashby is an applicant-tracking system. Companies publish a public job
board. Ashby exposes those listed postings over HTTP with **no API key**.

MyNextJob discovers those jobs, maps them onto the Phase 3
`NormalizedJobInput` contract, and persists them through the existing
Job Engine + `SupabaseJobStore`. The adapter never writes SQL.

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md),
[`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md), and
[`JOB_SOURCE_LEVER.md`](./JOB_SOURCE_LEVER.md).

## Public API

No Ashby API key is required or accepted for discovery. Do not create
`ASHBY_API_KEY`.

```text
GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}
GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true
```

`JOB_BOARD_NAME` is the final path segment of
`https://jobs.ashbyhq.com/{JOB_BOARD_NAME}` (example: `junipersquare`).
It is stored on `job_sources.external_identifier`.

Authenticated Ashby APIs (`jobPosting.list`, `jobPosting.info`,
`application.create`, `applicationForm.submit`) are out of scope.
MyNextJob does not submit Ashby applications.

Official contract:
[Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).

## Trusted host

Ingestion always calls `https://api.ashbyhq.com/posting-api/job-board/{board}`.
Careers pages may use `https://jobs.ashbyhq.com/{board}`. Arbitrary
source-metadata URLs are rejected. The board name is path-validated
(`letters`, `numbers`, `-`, `_`) and cannot change the hostname.

## One-request snapshot

Unlike Lever, the public Job Posting API returns the board in **one**
response. The adapter does not invent pagination.

Safety caps (incomplete snapshot if hit first):

- max **2000** jobs per source
- max **5 MiB** response body (source failure — the body cannot be
  truncated into valid JSON)

If the jobs array is truncated by the job cap, `snapshotComplete` is
false and missing-job lifecycle is not applied.

## Public listing rules

Ashby `isListed === false` means the posting may exist by direct link
but should not appear on the public board. MyNextJob is a public
discovery product, so those rows are skipped (`unlistedSkipped`) and
never persisted. They are not counted as malformed. Skipping them does
**not** make the listed-job snapshot incomplete.

Ingest only when `isListed !== false`.

## Identity

Live public boards currently include `jobs[].id` as a UUID even though
the official field table omits it. Every listed posting on the QA
boards had a UUID `id` that also appeared in `jobUrl` / `applyUrl`.

Preferred identity: `String(job.id)` → `externalId`.

If `id` is absent, the adapter may extract a UUID from `jobUrl` only
when:

- hostname is `jobs.ashbyhq.com`
- the first path segment matches this configured board
- the next path segment is a valid UUID

Title / company / location are never used as identity. The job-URL
fallback is counted separately (`identityFromJobUrl`).

## Mapping

| Ashby | Normalized / canonical |
| --- | --- |
| `id` | `externalId` (string). Source-posting identity. |
| `title` | title as published |
| `location` | `location.text` |
| `address.postalAddress` | city / region / country only when present |
| `secondaryLocations` | raw payload; exactly one clear entry may fill a missing primary location |
| `workplaceType` | Remote → remote, Hybrid → hybrid, OnSite → onsite. Beats `isRemote`. |
| `isRemote` | remote only when `workplaceType` is missing and the flag is true |
| `employmentType` | FullTime / PartTime / Intern / Contract / Temporary. Else unknown → NULL |
| `department` / `team` | on the normalized input (no `jobs` columns) |
| `descriptionHtml` | Phase 3 sanitizer. `descriptionPlain` only if HTML is absent. |
| `publishedAt` | canonical `publishedAt` when it is a parseable ISO timestamp |
| `jobUrl` | `sourceUrl` |
| `applyUrl` | `applyUrl` |
| `compensation` | salary only when one unambiguous Salary component exists |

`workplaceType` wins if it conflicts with `isRemote`. Both values stay
in the raw payload. Location-text inference is last and never scans the
description.

`published_at` is Ashby's last-published timestamp.
`discovered_at` is the first time MyNextJob stored the job.
`last_seen_at` is the latest successful source sync. Do not substitute
`discovered_at` for a missing or malformed `publishedAt`.

## Compensation

The adapter always requests `includeCompensation=true`.

Canonical salary is mapped only from structured `compensationType =
Salary` components with finite min/max (min ≤ max) and a recognizable
interval (`1 YEAR` / `1 MONTH` / `1 DAY` / `1 HOUR`).

Bonus, equity, commission, and other component types never become
`salary_min` / `salary_max`. Multiple conflicting Salary tiers stay
canonical NULL. `scrapeableCompensationSalarySummary` is preserved in
the capped raw payload and is not parsed into numbers.

## Company / source registry

Migration [`0008_ashby_sources.sql`](../supabase/migrations/0008_ashby_sources.sql)
seeds four live-verified QA boards. Review it before applying. It does
not create Ashby-specific tables.

| Company | Board | Domain | Listed jobs at verification |
| --- | --- | --- | --- |
| Juniper Square | `junipersquare` | junipersquare.com | 43 / 43 |
| Granica | `granica` | granica.ai | 10 / 10 |
| TRM Labs | `trm-labs` | trmlabs.com | 110 / 110 |
| Mem0 | `mem0` | mem0.ai | 5 / 5 |

`source_type = ashby`, `enabled = true`, `sync_frequency_minutes = 15`.
No cron is installed in this phase.

WarpBuild (`warpbuild`) careers HTML returned 200 but the public API
returned 404, so it is not seeded.

## Manual sync

```bash
pnpm jobs:ashby --source=junipersquare --dry-run
pnpm jobs:ashby --source=junipersquare
pnpm jobs:ashby --all
pnpm jobs:ashby --all --dry-run
```

`--source` accepts a `job_sources` UUID or the Ashby board name.

Dry-run prints API version, fetched / listed / accepted / rejected /
unlisted skipped, snapshot completeness, and a short
title / location / workplace sample. It does not print descriptions or
raw payloads.

Live run uses `SupabaseJobStore` and `syncJobSource`.

### Idempotency check

1. Review and apply `0008`.
2. Dry-run `junipersquare` (or `mem0` if you want the smaller board).
3. Live-sync that one source once. Do not start with `--all`.
4. Live-sync the same source again. Canonical job and posting counts
   must stay the same; `unchanged` should increase.

## Known limitations

- Official docs do not list `jobs[].id`; live boards currently expose it
- Compensation is often present as an empty object
- Multiple geography salary tiers stay canonical NULL
- Secondary locations are not a first-class canonical array
- No job skills, matching, feed UI, cron, or Ashby apply API
- Signup confirmation `/error` and Custom SMTP are unrelated and deferred
