-- =============================================================================
-- Phase 3 — Job Engine foundation
-- =============================================================================
-- Additive only. Does not rewrite 0001–0004. Does not drop jobs.source_id
-- or jobs.external_id (those remain original-source compatibility fields).
--
-- Apply in the SQL Editor after 0001–0004.
-- Automatically expose new tables = OFF: every privilege below is explicit.
--
-- Roles:
--   authenticated — SELECT on shared job catalogs (companies, job_sources,
--                   jobs, job_skills). NO access to job_source_postings
--                   (contains internal raw_payload) or source_sync_runs.
--   service_role  — least-privilege read/write for backend ingestion.
--                   RLS bypass does NOT grant table privileges; GRANT is
--                   required.
--   anon          — nothing on these tables.
--
-- Enum policy: only add values that are genuine canonical product states.
-- Engine contract values such as remote/employment/salary "unknown" and
-- adapter-only "synthetic" are mapped to NULL or source_type=custom in
-- application code. They are not added to Postgres enums.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- Missing-job lifecycle: open → possibly_closed → closed.
-- Existing values remain: open | closed | draft | expired.
-- Not used as a column default in this file — PostgreSQL cannot use a
-- newly added enum value until the surrounding transaction commits.
alter type public.job_status add value if not exists 'possibly_closed';

-- Do NOT add source_type = 'synthetic'. The synthetic adapter is test/dev
-- only. Live providers stay: greenhouse, lever, ashby, workday,
-- smartrecruiters, we_work_remotely, rss, custom.
--
-- employment_type already has: full_time, part_time, contract, internship,
-- temporary, freelance. Engine "unknown" → NULL.
-- remote_type already has: remote, hybrid, onsite, any. Engine "unknown"
-- → NULL. Do not persist "any" from ingestion.

-- -----------------------------------------------------------------------------
-- companies — identity for concurrent ingestion
-- -----------------------------------------------------------------------------
-- Live seed currently has no company rows, so a unique domain index is safe.
-- Domain is the strong company identifier when present.
alter table public.companies
  add column if not exists name_key text;

comment on column public.companies.name_key is
  'Case/whitespace-folded comparison key. Display name stays in name. Not unique — domain is the strong identity.';

create index if not exists companies_name_key_idx
  on public.companies (name_key)
  where name_key is not null;

drop index if exists public.companies_domain_idx;

create unique index if not exists companies_domain_lower_uidx
  on public.companies (lower(domain))
  where domain is not null and btrim(domain) <> '';

-- -----------------------------------------------------------------------------
-- jobs — lifecycle + freshness helpers (non-destructive)
-- -----------------------------------------------------------------------------
-- content_hash: skip no-op updates when the same source posting is unchanged.
-- consecutive_misses: denormalized max of this job's source-posting misses.
-- closed_at / status_changed_at: freshness + lifecycle audit.
-- city: conservative location field for later search/matching (nullable).
-- salary_period: source-reported period; "unknown" is stored as NULL.
-- fingerprint remains non-unique (duplicate candidate, not identity).
-- unique (source_id, external_id) on jobs is unchanged.

alter table public.jobs
  add column if not exists content_hash text,
  add column if not exists consecutive_misses integer not null default 0,
  add column if not exists closed_at timestamptz,
  add column if not exists status_changed_at timestamptz,
  add column if not exists city text,
  add column if not exists salary_period text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_consecutive_misses_nonnegative'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_consecutive_misses_nonnegative
      check (consecutive_misses >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_salary_period_valid'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_salary_period_valid
      check (
        salary_period is null
        or salary_period in ('hour', 'day', 'month', 'year')
      );
  end if;
end $$;

comment on column public.jobs.source_id is
  'Original/primary source compatibility field. Multi-source evidence lives in job_source_postings. Do not treat this as the only provenance.';
comment on column public.jobs.external_id is
  'External id from the original/primary source. Additional sources store their own ids on job_source_postings.';
comment on column public.jobs.fingerprint is
  'Duplicate CANDIDATE key (SHA-256 of company + title + location + employment). NOT globally unique. Two legitimate openings may share a fingerprint. No unique index.';
comment on column public.jobs.discovered_at is
  'First time MyNextJob persisted this canonical job. Never overwrite on refresh.';
comment on column public.jobs.last_seen_at is
  'Most recent successful source sync that contained a posting for this job.';
comment on column public.jobs.published_at is
  'Employer/source-reported publication time. Distinct from discovered_at.';
comment on column public.jobs.content_hash is
  'Hash of normalized title/description/location/salary. Unchanged hash → skip canonical rewrite.';
comment on column public.jobs.salary_period is
  'hour | day | month | year. Engine "unknown" is persisted as NULL. No currency conversion.';

create index if not exists jobs_content_hash_idx
  on public.jobs (content_hash)
  where content_hash is not null;

-- jobs_fingerprint_idx already exists and is NOT unique. Keep it that way.

-- -----------------------------------------------------------------------------
-- source_sync_runs — richer counters without 20 debug columns
-- -----------------------------------------------------------------------------
alter table public.source_sync_runs
  add column if not exists jobs_rejected integer not null default 0,
  add column if not exists metrics jsonb not null default '{}'::jsonb;

comment on column public.source_sync_runs.metrics is
  'Structured sync counters (accepted, unchanged, source postings, duplicate candidates, failures). Do not store payloads or secrets.';

-- -----------------------------------------------------------------------------
-- job_source_postings — 1..N source evidence per canonical job
-- SERVER-ONLY. Contains raw_payload. Not exposed to authenticated.
-- -----------------------------------------------------------------------------
create table if not exists public.job_source_postings (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  source_id           uuid not null references public.job_sources(id) on delete cascade,
  external_id         text not null,
  source_url          text,
  apply_url           text,
  raw_payload         jsonb,
  published_at        timestamptz,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  active              boolean not null default true,
  content_hash        text,
  consecutive_misses  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, external_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_source_postings_consecutive_misses_nonnegative'
      and conrelid = 'public.job_source_postings'::regclass
  ) then
    alter table public.job_source_postings
      add constraint job_source_postings_consecutive_misses_nonnegative
      check (consecutive_misses >= 0);
  end if;
end $$;

create index if not exists job_source_postings_job_idx
  on public.job_source_postings (job_id);

create index if not exists job_source_postings_last_seen_idx
  on public.job_source_postings (last_seen_at);

create index if not exists job_source_postings_active_idx
  on public.job_source_postings (source_id)
  where active;

comment on table public.job_source_postings is
  'Per-source evidence for a canonical job. unique(source_id, external_id) is the primary idempotency key. Server-only: contains raw_payload. Authenticated users must not SELECT this table.';
comment on column public.job_source_postings.consecutive_misses is
  'Complete-snapshot misses for THIS source only. Partial snapshots and source failures must not increment this.';

drop trigger if exists job_source_postings_set_updated_at on public.job_source_postings;
create trigger job_source_postings_set_updated_at
  before update on public.job_source_postings
  for each row execute function public.set_updated_at();

alter table public.job_source_postings enable row level security;

-- No policies: authenticated/anon cannot read rows even if a grant slipped
-- through. service_role bypasses RLS but still needs GRANT below.
drop policy if exists "job_source_postings_select_authenticated" on public.job_source_postings;

-- -----------------------------------------------------------------------------
-- Grants — explicit, least privilege
-- -----------------------------------------------------------------------------
grant usage on schema public to service_role;

-- Backend Job Engine (Phase 4 adapters use the same store). No DELETE.
grant select, insert, update on table public.companies to service_role;
grant select, insert, update on table public.job_sources to service_role;
grant select, insert, update on table public.jobs to service_role;
grant select, insert, update on table public.job_source_postings to service_role;
grant select, insert, update on table public.source_sync_runs to service_role;

revoke all on table public.job_source_postings from anon, authenticated, public;
revoke all on table public.source_sync_runs from anon, authenticated, public;

-- Shared catalogs stay read-only for signed-in users (idempotent with 0003).
-- jobs.raw_payload already exists on the catalog; a later phase can hide it
-- via a view. job_source_postings is withheld now because it is new internal
-- evidence plus raw_payload.
grant select on table public.companies to authenticated;
grant select on table public.job_sources to authenticated;
grant select on table public.jobs to authenticated;
grant select on table public.job_skills to authenticated;

revoke insert, update, delete on table public.companies
  from anon, authenticated, public;
revoke insert, update, delete on table public.job_sources
  from anon, authenticated, public;
revoke insert, update, delete on table public.jobs
  from anon, authenticated, public;
revoke insert, update, delete on table public.job_skills
  from anon, authenticated, public;
