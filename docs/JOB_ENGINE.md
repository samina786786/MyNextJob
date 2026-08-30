# Job Engine

Phase 3 builds the shared pipeline every source must use. Adapters
fetch and map only. The engine validates, sanitizes, dedupes, and
persists.

Phase 4A adds the Greenhouse Job Board adapter
([`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md)). Phase 4B
adds Lever Postings API v0
([`JOB_SOURCE_LEVER.md`](./JOB_SOURCE_LEVER.md)). Ashby and We Work
Remotely are still later.

Jobs are treated as durable structured data: **identity, provenance,
freshness, lifecycle, and trust** — not disposable scraped cards.

## Pipeline

```text
External Source
      ↓
Source Adapter          fetch + map only
      ↓
NormalizedJobInput
      ↓
Validation (Zod)
      ↓
Normalization           title, company, domain, location, types
      ↓
Sanitization            HTML, URLs, raw payload
      ↓
Identity / fingerprint  duplicate candidate, not a unique key
      ↓
Duplicate detection     conservative merge
      ↓
Canonical job
      ↓
Source posting evidence 1..N per job
      ↓
Sync metrics
```

Adapters never write to Supabase. The frontend never reads
Greenhouse/Lever/Ashby response shapes.

## Adapter contract

```ts
interface JobSourceAdapter {
  readonly provider: JobSourceProvider;
  fetchJobs(context: JobSourceContext): Promise<AdapterFetchResult>;
}
```

`AdapterFetchResult`:

- `jobs` — already mapped onto `NormalizedJobInput` (provider-neutral)
- `snapshotComplete` — whether this result is the full current listing
- `metadata` — optional `pages` / `requestCount` only; no ATS-specific keys

**Pagination:** each adapter owns provider paging and returns one logical
snapshot per `fetchJobs` call. The generic engine does not understand
Greenhouse pages or Lever cursors.

**Limits:** adapters may cap how many jobs they return. If they truncate,
they must set `snapshotComplete: false`.

Phase 3 ships `SyntheticAdapter` (`src/lib/jobs/adapters/synthetic.ts`)
for tests and `pnpm jobs:synthetic`. Phase 4A ships
`GreenhouseAdapter` (`src/lib/jobs/adapters/greenhouse.ts`) and
`pnpm jobs:greenhouse`. Phase 4B ships `LeverAdapter`
(`src/lib/jobs/adapters/lever.ts`) and `pnpm jobs:lever`.

## Normalized job contract

Required before a job may enter the canonical store:

- source id
- external source identity
- company name (and/or id)
- title
- HTTP(S) `applyUrl` **or** `sourceUrl`

Description may be empty when a source genuinely omits it.

Rejected rather than persisted: missing identity, unsafe URLs
(`javascript:`, `data:`, `file:`), `salary.min > salary.max`, payloads
over 32 KiB after secret-key stripping.

Provider-specific names (`greenhouseDepartment`, `leverCategories`,
`ashbyJobId`) are not on the schema. They belong only in `raw_payload`
on the **source posting**.

## Canonical job vs source posting

`jobs` is the canonical opening.

`jobs.source_id` and `jobs.external_id` remain as **original/primary
source compatibility fields**. They are not dropped. They are not the
only provenance.

`job_source_postings` holds 1..N evidence rows. **It is server-only**
because `raw_payload` is internal. Authenticated clients do not SELECT
it. A later phase can add a safe attribution view.

| Field | Role |
| --- | --- |
| `(source_id, external_id)` | Unique. Primary idempotency key. |
| `job_id` | Canonical job |
| `first_seen_at` / `last_seen_at` | Freshness for this source |
| `content_hash` | Skip no-op updates |
| `consecutive_misses` | Complete-snapshot misses for this source |
| `raw_payload` | Debug/reconstruct mapping only |

The same employer opening may later arrive from a company ATS **and**
WWR. That is one canonical job and two postings — when merge confidence
is strong enough.

## Company resolution

Priority:

1. Explicit `company_id`
2. Canonical normalized domain (`https://www.example.com/` → `example.com`)
3. Normalized company name (Unicode fold, trim, collapse whitespace, case-fold)
4. Create a company when the engine is allowed to (Phase 3 tests always may)

Legal suffixes (`Ltd`, `Inc`, `Pty Ltd`) are **not** stripped. Display
name stays separate from the comparison key.

## Normalization and security

| Field | Display | Comparison |
| --- | --- | --- |
| Title | Trim / Unicode fold only | Case + whitespace fold |
| Location | Original `location_text` | Conservative string; Hyderabad vs Hyderabad, Telangana stay distinct |
| Remote | Explicit adapter value wins | Location text is fallback only when remote is `unknown` |
| Domain | — | Hostname, strip `www`, http(s) only, no credentials |
| URLs | Stored as given if safe | http(s) only; never followed during normalize |
| HTML | `sanitize-html` server-side | Script/style/`javascript:` stripped; plain text derived separately |

Engine `unknown` for remote, employment, and salary period is **not** a
Postgres enum value. Persistence maps those to `NULL`. `part_time` and
`temporary` already exist on `employment_type`. The synthetic adapter
does not add `source_type = synthetic`; live rows use `custom` if a
dev source were ever persisted.

Plain text keeps punctuation in `C++`, `C#`, `.NET`, `Node.js`, `Next.js`.

`raw_payload` strips keys that look like secrets and is capped at 32 KiB.
It is not logged.

## Identity and deduplication

**Source identity** `(source_id, external_id)` is unique. Running the
same sync twice must not create a second posting.

**Fingerprint** = SHA-256 of:

- canonical company (domain if present, else name key)
- normalized title
- normalized location comparison string
- employment type

Fingerprint is **not unique**. Multiple Software Engineer requisitions
at the same company and site are allowed. There is no unique index on
`jobs.fingerprint`.

**Content hash** = SHA-256 of title, description text, location, salary,
remote type, employment type. Timestamps such as `fetched_at` /
`discovered_at` are excluded. Same external job + same hash → no
canonical rewrite (only `last_seen_at`).

**Automatic merge** only when evidence is strong: same company, title,
location, substantially identical description, compatible publish window
(90 days if both dates exist). Same title/company with a different
description stays two canonical jobs.

## Lifecycle

Database `job_status` is `open | possibly_closed | closed | draft | expired`.
Engine “active” maps to `open`.

| Event | Result |
| --- | --- |
| Seen this sync | `open`, misses reset, `last_seen_at` updated |
| One complete-snapshot miss | Stay `open` |
| Repeated complete misses | `possibly_closed`, then `closed` |
| Partial snapshot omission | **Not a miss** |
| Source fetch failure | Fail the run, increment `error_count`, **do not** mass-close |
| Reappearance | `open`, misses reset, same canonical row |

Defaults: 2 complete misses → `possibly_closed`, 4 → `closed`. Sources
may override via `job_sources.metadata`
(`missesBeforePossiblyClosed`, `missesBeforeClosed`). Do not hardcode
ATS-specific thresholds in the generic engine.

Timestamps:

- `published_at` — employer/source-reported
- `discovered_at` — first time MyNextJob stored the canonical job (never overwritten)
- `last_seen_at` — most recent successful sync that contained a posting

Freshness UI (“Just now”, “Yesterday”) is Phase 5; the engine already
stores the timestamps it needs.

## Sync runs

`syncJobSource(store, sourceId, adapter)`:

1. Insert `source_sync_runs` (`running`)
2. Adapter fetch
3. Persist each job in batches of **100** (`JOB_ENGINE_BATCH_SIZE`)
4. Job-level validation failures increment `rejected` and do **not** fail the run
5. Lifecycle only if `snapshotComplete`
6. Finish `succeeded` / `failed` with a JSON `metrics` object

Metrics include fetched, accepted, rejected, canonical created/updated,
unchanged, source postings created/updated, duplicate candidates,
failures.

Source health uses the existing enum `active | paused | error | disabled`:

- success → `active`, `error_count = 0`, `last_synced_at` set
- first failures stay `active` (degraded)
- `error_count >= 3` → `error`
- `disabled` is never auto-cleared

`next_sync_at` is stored with a deterministic backoff helper. **No cron
and no queue in Phase 3.**

## Persistence architecture

`JobEngineStore` is the persistence contract. `MemoryJobStore` backs
deterministic unit tests (no secret, no network). `SupabaseJobStore`
is the production implementation Phase 4 adapters must use — they do
not invent SQL.

Privileged writes use `SUPABASE_SECRET_KEY` via
`src/lib/supabase/admin.ts` (`server-only`). The legacy
`SUPABASE_SERVICE_ROLE_KEY` name is an optional fallback. Neither is
required for unit tests. Never put either in `NEXT_PUBLIC_*`.

`0005` grants `service_role` select/insert/update on `companies`,
`job_sources`, `jobs`, `job_source_postings`, and `source_sync_runs`.
RLS bypass does not replace those GRANTs.

Do not expose a public ingest endpoint.

Exercise the engine locally:

```bash
pnpm jobs:synthetic
pnpm jobs:greenhouse --source=dscout --dry-run
pnpm jobs:lever --source=drivetrain --dry-run
```

## What Phase 3 does not do

- Ashby / WWR / Workday / LinkedIn / Naukri adapters
- Cron, queues, job feed UI, matching, applications, AI
- Showing ingested jobs to signed-in users on `/home`
