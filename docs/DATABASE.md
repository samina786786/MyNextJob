# Database

The initial schema lives in
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).
Phase 1 adds
[`0002_auth_profile_provisioning.sql`](../supabase/migrations/0002_auth_profile_provisioning.sql):
a `security definer` trigger on `auth.users` that inserts one
`public.profiles` row (`full_name` from user metadata when present).

Every user-owned table has RLS enabled with owner-only policies. Shared
read-mostly tables (companies, jobs, skills, job_skills, job_sources) are
readable by any authenticated user; writes are reserved for server-side
`service_role` code (which bypasses RLS).

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
`parse_status` enum tracks whether the parser has processed the file
(Phase 2).

### `job_preferences`

One row per user. Captures what the user is looking for: target roles,
preferred locations, remote/hybrid/onsite modes, employment types, salary
floor, minimum match score, and excluded keywords. The matching engine
and notification worker both read from here.

### `companies`

Shared reference data about companies MyNextJob knows about. Includes
name, slug (`citext`), domain, logo URL, careers URL, industry, and ATS
provider details. Ingestion workers upsert into this table.

### `job_sources`

Where jobs come from. Each row represents a scrape/API target for a
company: `source_type` (Greenhouse, Lever, Ashby, WWR, RSS, …),
`external_identifier`, sync cadence, next-sync time, and current status.
The scheduler picks the next source by `next_sync_at`.

### `jobs`

Normalized job postings. Every source's raw response is transformed into
this shape by the adapter layer. Unique on `(source_id, external_id)` so
the same source's re-ingest updates rather than duplicates. `fingerprint`
lets the dedupe layer group the same job across sources without losing
per-source rows.

### `skills`

Canonical skill taxonomy. Each skill has a name, `citext` slug, aliases
array (e.g. `React.js`, `ReactJS`, `React JS` → canonical `React`), and
category (e.g. "language", "framework"). No seed data yet — Phase 3
introduces it.

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
         └── jobs (1:N) ── job_skills (N:M) ── skills
         └── source_sync_runs (1:N)
```

## RLS summary

- **User-owned**: profiles, resumes, job_preferences, resume_skills,
  job_matches (read only), saved_jobs, applications, application_events,
  push_subscriptions, notification_preferences, notifications
  (select+update only).
- **Authenticated read-only**: companies, job_sources, jobs, skills,
  job_skills.
- **Server-only**: source_sync_runs (no policies granted).

## Storage policies (`resumes` bucket)

The bucket is private (`public = false`, 10 MB cap, **PDF and DOCX only**).
`.doc` binaries and `.txt` files are rejected on purpose — V1's parser
only needs those two formats.
Every object path must start with `{user_id}/`, and the policies use
`storage.foldername(name)[1] = auth.uid()::text` to scope access.

Never generate public URLs for resume objects. Server code should mint
short-lived signed URLs when a user needs to view or download their file.
