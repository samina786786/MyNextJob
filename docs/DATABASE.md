# Database

The initial schema lives in
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).
Phase 1 adds
[`0002_auth_profile_provisioning.sql`](../supabase/migrations/0002_auth_profile_provisioning.sql):
a `security definer` trigger on `auth.users` that inserts one
`public.profiles` row (`full_name` from user metadata when present).
[`0003_data_api_grants.sql`](../supabase/migrations/0003_data_api_grants.sql)
grants `authenticated` the table privileges RLS assumes (no `anon`
grants on user-owned data). Phase 2 adds
[`0004_profile_resume_onboarding.sql`](../supabase/migrations/0004_profile_resume_onboarding.sql):
skill catalog seed, `freelance` on `employment_type`, match-score
default 75, and explicit grants/revokes for the taxonomy. Phase 3 adds
[`0005_job_engine.sql`](../supabase/migrations/0005_job_engine.sql):
`job_source_postings` (server-only), job lifecycle columns,
`possibly_closed`, unique lower(domain) on companies, sync-run
`metrics`, and explicit `service_role` grants. Phase 4A adds
[`0006_greenhouse_sources.sql`](../supabase/migrations/0006_greenhouse_sources.sql):
curated Greenhouse companies/sources only — no new tables. Phase 4B adds
[`0007_lever_sources.sql`](../supabase/migrations/0007_lever_sources.sql):
curated Lever companies/sources only — no new tables. Review both
before applying. See [`JOB_ENGINE.md`](./JOB_ENGINE.md),
[`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md), and
[`JOB_SOURCE_LEVER.md`](./JOB_SOURCE_LEVER.md).

Every user-owned table has RLS enabled with owner-only policies. Shared
read-mostly tables (companies, jobs, skills, job_skills, job_sources)
are readable by any authenticated user; writes are reserved for
server-side `service_role` code. `job_source_postings` and
`source_sync_runs` are server-only (no authenticated GRANT). RLS bypass
does not replace table GRANTs — 0005 grants `service_role` select/insert/update
on the engine tables.

## The tables in plain language

### `profiles`

One row per Supabase auth user. Stores display info like `full_name`,
`headline`, `city`, `country`, `years_experience`, and whether the user
has completed onboarding. Primary key references `auth.users(id)`, so
deleting the auth user cascades.

### `resumes`

Metadata about a user's uploaded resume file. The actual file lives in
the private `resumes` storage bucket at `{user_id}/…`. Each user may mark
one resume as `is_default = true` — the unique index enforces that. The
`parse_status` enum is `pending | processing | succeeded | failed`.
Parser output is JSON in `parsed_content` (versioned, no raw parser
internals). See [`PROFILE_RESUME.md`](./PROFILE_RESUME.md).

### `job_preferences`

One row per user. Captures what the user is looking for: target roles,
preferred locations, remote/hybrid/onsite modes, employment types, salary
floor, minimum match score (default 75 after 0004), and excluded keywords.
The matching engine and notification worker both read from here.

### `companies`

Shared reference data about companies MyNextJob knows about. Includes
name, slug (`citext`), `name_key` (comparison fold), domain, logo URL,
careers URL, industry, and ATS provider details. When `domain` is
present it is the strong identity: unique on `lower(domain)` (partial,
non-null). Ingestion workers upsert into this table.

### `job_sources`

Where jobs come from. Each row represents a scrape/API target for a
company: `source_type` (Greenhouse, Lever, Ashby, WWR, RSS, …),
`external_identifier`, sync cadence, next-sync time, and current status.
`external_identifier` holds the Greenhouse board token (and later
provider ids). A unique index on `(source_type, lower(trim(external_identifier)))`
is added in `0006`. No cron is installed in Phase 4A.

### `jobs`

Canonical job openings. Every source is mapped onto this shape by the
Job Engine. `source_id` + `external_id` are **original/primary source
compatibility fields** (unique together on this table). They are not
dropped in Phase 3. Additional sources attach via `job_source_postings`.

`fingerprint` is a duplicate **candidate** (SHA-256 of company + title +
location + employment). It is indexed but **not unique** — two legitimate
requisitions may share that tuple. `content_hash` skips no-op updates.
`discovered_at` is first seen by MyNextJob and must never be overwritten;
`published_at` is the employer's date; `last_seen_at` is the latest sync
that contained a posting. Status includes `possibly_closed` after
repeated complete-snapshot misses.

### `job_source_postings`

Per-source evidence for a canonical job. Unique on `(source_id,
external_id)` — that pair is the primary idempotency key. A job may have
1..N postings. **Server-only** — contains `raw_payload`. Authenticated
users have no SELECT grant or RLS policy. A safe attribution view can
land in a later user-facing phase. Writes are `service_role` /
`SupabaseJobStore`. Misses are counted per posting and only on complete
snapshots.

### `skills`

Canonical skill taxonomy. Each skill has a name, `citext` slug, aliases
array (e.g. `React.js`, `ReactJS`, `React JS` → canonical `React`), and
category (e.g. "language", "framework"). Phase 2 seeds ~75 software
skills. Authenticated users may `SELECT`; they must not insert/update/
delete the shared taxonomy.

### `resume_skills`

Which skills were extracted from a resume, with `confidence` (0–1),
optional `years_experience`, and `extraction_source` (parser / user / llm).
Unique on `(resume_id, skill_id)`.

### `job_skills`

Which skills a job requires. `importance` marks each row as required,
preferred, or unknown. Unique on `(job_id, skill_id)`.

### `job_matches`

Computed match results. One row per `(user, resume, job)` with a
`score` 0–100, a JSON `breakdown` explaining the score, and arrays of
matched/missing skill IDs. Written only by trusted server workers.

### `saved_jobs`

Composite-key table connecting user ↔ job with a `saved_at` timestamp.
Prevents duplicate saves by construction.

### `applications`

The user's application record for a specific job. Tracks status
(applied, recruiter_contacted, assessment, interview, final_round,
offer, rejected, withdrawn), which resume was used, and free-text notes.

### `application_events`

Append-only history for each application — every status change writes a
row here with an optional note. Never updated in place.

### `push_subscriptions`

Web Push endpoints per user (Phase 8). Unique on `(user_id, endpoint)`.

### `notification_preferences`

Whether the user wants notifications, minimum match score, quiet hours,
timezone, and which categories of notifications they want.

### `notifications`

Per-user notification inbox. `read_at` is null until the user reads it —
a partial index makes "unread for user X" fast.

### `source_sync_runs`

Operational log of each ingestion run per source. **Not** exposed to
users — no `select` policy is granted, so only `service_role` can read it.

## Relationships (quick view)

```
auth.users
  ├── profiles (1:1)
  ├── resumes (1:N) ──── resume_skills (N:M) ──── skills
  ├── job_preferences (1:1)
  ├── job_matches (1:N) ── jobs
  ├── saved_jobs (N:M) ── jobs
  ├── applications (1:N) ── jobs
  │      └── application_events (1:N)
  ├── push_subscriptions (1:N)
  ├── notification_preferences (1:1)
  └── notifications (1:N)

companies
  └── job_sources (1:N)
         └── job_source_postings (1:N) ── jobs (N:1)
         └── jobs (1:N original/primary source, compatibility)
                └── job_skills (N:M) ── skills
         └── source_sync_runs (1:N)
```

## RLS summary

- **User-owned**: profiles, resumes, job_preferences, resume_skills,
  job_matches (read only), saved_jobs, applications, application_events,
  push_subscriptions, notification_preferences, notifications
  (select+update only).
- **Authenticated read-only**: companies, job_sources, jobs, skills,
  job_skills.
- **Server-only**: `source_sync_runs`, `job_source_postings` (no
  authenticated/anon grants). Ingestion writes use explicit
  `service_role` GRANT select/insert/update from 0005.

## Storage policies (`resumes` bucket)

The bucket is private (`public = false`, 10 MB cap, **PDF and DOCX only**).
`.doc` binaries and `.txt` files are rejected on purpose — V1's parser
only needs those two formats.
Every object path must start with `{user_id}/`, and the policies use
`storage.foldername(name)[1] = auth.uid()::text` to scope access.

Never generate public URLs for resume objects. Server code should mint
short-lived signed URLs when a user needs to view or download their file.
