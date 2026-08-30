-- =============================================================================
-- MyNextJob — Initial schema
-- =============================================================================
-- Phase 0 foundation only: tables, indexes, RLS, and storage policies.
-- NO business logic. No seed data (skills, sources, jobs) is inserted here.
--
-- Conventions:
--   * UUID primary keys (`gen_random_uuid()` from pgcrypto).
--   * `created_at` / `updated_at` timestamps on every mutable table.
--   * `updated_at` is maintained by a shared trigger (`set_updated_at`).
--   * User-owned tables reference `auth.users(id)` with `on delete cascade`.
--   * All user-owned tables have RLS enabled with owner-only policies.
--   * Shared read-mostly tables (companies, jobs, skills) are RLS-enabled
--     with authenticated-read policies; writes are reserved for service_role.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. profiles — one row per auth user
-- =============================================================================
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  headline             text,
  years_experience     smallint check (years_experience is null or years_experience between 0 and 80),
  city                 text,
  country              text,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- =============================================================================
-- 2. resumes — private files owned by the user
-- =============================================================================
create type public.parse_status as enum ('pending', 'processing', 'succeeded', 'failed');

create table if not exists public.resumes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  label             text not null default 'My resume',
  original_filename text not null,
  storage_path      text not null,
  mime_type         text not null,
  file_size         integer not null check (file_size >= 0),
  is_default        boolean not null default false,
  parse_status      public.parse_status not null default 'pending',
  parsed_content    jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index resumes_user_id_idx on public.resumes (user_id);
create unique index resumes_one_default_per_user
  on public.resumes (user_id) where is_default;

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

alter table public.resumes enable row level security;

create policy "resumes_select_own" on public.resumes
  for select using (auth.uid() = user_id);
create policy "resumes_insert_own" on public.resumes
  for insert with check (auth.uid() = user_id);
create policy "resumes_update_own" on public.resumes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resumes_delete_own" on public.resumes
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 3. job_preferences — per-user job search preferences
-- =============================================================================
create type public.remote_type    as enum ('remote', 'hybrid', 'onsite', 'any');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'internship', 'temporary');

create table if not exists public.job_preferences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  target_roles         text[]    not null default '{}',
  preferred_locations  text[]    not null default '{}',
  work_modes           public.remote_type[]     not null default '{}',
  employment_types     public.employment_type[] not null default '{}',
  minimum_salary       integer,
  currency             text default 'USD',
  minimum_match_score  smallint not null default 70 check (minimum_match_score between 0 and 100),
  excluded_keywords    text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id)
);

create trigger job_preferences_set_updated_at
  before update on public.job_preferences
  for each row execute function public.set_updated_at();

alter table public.job_preferences enable row level security;

create policy "job_preferences_select_own" on public.job_preferences
  for select using (auth.uid() = user_id);
create policy "job_preferences_insert_own" on public.job_preferences
  for insert with check (auth.uid() = user_id);
create policy "job_preferences_update_own" on public.job_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "job_preferences_delete_own" on public.job_preferences
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 4. companies — shared reference data
-- =============================================================================
create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                citext not null unique,
  domain              text,
  logo_url            text,
  careers_url         text,
  industry            text,
  ats_provider        text,
  ats_identifier      text,
  hiring_regions      text[] not null default '{}',
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index companies_active_idx on public.companies (active);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;

create policy "companies_select_authenticated" on public.companies
  for select to authenticated using (true);
-- Writes reserved for service_role (which bypasses RLS). No policies granted.

-- =============================================================================
-- 5. job_sources — where jobs come from (ATS, feeds, ...)
-- =============================================================================
create type public.source_type as enum (
  'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters',
  'we_work_remotely', 'rss', 'custom'
);
create type public.source_status as enum ('active', 'paused', 'error', 'disabled');

create table if not exists public.job_sources (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid references public.companies(id) on delete set null,
  name                   text not null,
  source_type            public.source_type not null,
  base_url               text,
  external_identifier    text,
  enabled                boolean not null default true,
  sync_frequency_minutes integer not null default 60 check (sync_frequency_minutes > 0),
  last_synced_at         timestamptz,
  next_sync_at           timestamptz,
  status                 public.source_status not null default 'active',
  error_count            integer not null default 0,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index job_sources_next_sync_idx on public.job_sources (next_sync_at) where enabled;
create index job_sources_company_idx   on public.job_sources (company_id);

create trigger job_sources_set_updated_at
  before update on public.job_sources
  for each row execute function public.set_updated_at();

alter table public.job_sources enable row level security;

create policy "job_sources_select_authenticated" on public.job_sources
  for select to authenticated using (true);

-- =============================================================================
-- 6. jobs — normalized job listings
-- =============================================================================
create type public.job_status as enum ('open', 'closed', 'draft', 'expired');

create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid not null references public.job_sources(id) on delete cascade,
  external_id      text not null,
  company_id       uuid references public.companies(id) on delete set null,
  title            text not null,
  slug             text,
  description_html text,
  description_text text,
  location_text    text,
  country          text,
  remote_type      public.remote_type,
  employment_type  public.employment_type,
  experience_min   smallint,
  experience_max   smallint,
  salary_min       integer,
  salary_max       integer,
  salary_currency  text,
  published_at     timestamptz,
  discovered_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  status           public.job_status not null default 'open',
  apply_url        text,
  source_url       text,
  raw_payload      jsonb,
  -- Deterministic fingerprint (e.g. hash of title+company+location) used to
  -- correlate the same job appearing across multiple sources. Not unique on
  -- its own because we want to retain duplicate-source evidence.
  fingerprint      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_id, external_id)
);

create index jobs_company_idx      on public.jobs (company_id);
create index jobs_status_idx       on public.jobs (status);
create index jobs_published_at_idx on public.jobs (published_at desc);
create index jobs_last_seen_idx    on public.jobs (last_seen_at desc);
create index jobs_fingerprint_idx  on public.jobs (fingerprint);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;

create policy "jobs_select_authenticated" on public.jobs
  for select to authenticated using (true);

-- =============================================================================
-- 7. skills — canonical taxonomy
-- =============================================================================
create table if not exists public.skills (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       citext not null unique,
  aliases    text[] not null default '{}',
  category   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index skills_category_idx on public.skills (category);

create trigger skills_set_updated_at
  before update on public.skills
  for each row execute function public.set_updated_at();

alter table public.skills enable row level security;

create policy "skills_select_authenticated" on public.skills
  for select to authenticated using (true);

-- =============================================================================
-- 8. resume_skills — extracted skills per resume
-- =============================================================================
create type public.extraction_source as enum ('parser', 'user', 'llm');

create table if not exists public.resume_skills (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  resume_id          uuid not null references public.resumes(id) on delete cascade,
  skill_id           uuid not null references public.skills(id) on delete cascade,
  confidence         numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  years_experience   numeric(4,1),
  extraction_source  public.extraction_source not null default 'parser',
  created_at         timestamptz not null default now(),
  unique (resume_id, skill_id)
);

create index resume_skills_user_idx   on public.resume_skills (user_id);
create index resume_skills_resume_idx on public.resume_skills (resume_id);
create index resume_skills_skill_idx  on public.resume_skills (skill_id);

alter table public.resume_skills enable row level security;

create policy "resume_skills_select_own" on public.resume_skills
  for select using (auth.uid() = user_id);
create policy "resume_skills_insert_own" on public.resume_skills
  for insert with check (auth.uid() = user_id);
create policy "resume_skills_update_own" on public.resume_skills
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resume_skills_delete_own" on public.resume_skills
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 9. job_skills — skills required/preferred by a job
-- =============================================================================
create type public.skill_importance as enum ('required', 'preferred', 'unknown');

create table if not exists public.job_skills (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id)   on delete cascade,
  skill_id    uuid not null references public.skills(id) on delete cascade,
  importance  public.skill_importance not null default 'unknown',
  created_at  timestamptz not null default now(),
  unique (job_id, skill_id)
);

create index job_skills_job_idx   on public.job_skills (job_id);
create index job_skills_skill_idx on public.job_skills (skill_id);

alter table public.job_skills enable row level security;

create policy "job_skills_select_authenticated" on public.job_skills
  for select to authenticated using (true);

-- =============================================================================
-- 10. job_matches — computed match results (populated by future engine)
-- =============================================================================
create table if not exists public.job_matches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  resume_id      uuid not null references public.resumes(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  score          smallint not null check (score between 0 and 100),
  breakdown      jsonb not null default '{}'::jsonb,
  matched_skills uuid[] not null default '{}',
  missing_skills uuid[] not null default '{}',
  calculated_at  timestamptz not null default now(),
  unique (user_id, resume_id, job_id)
);

create index job_matches_user_score_idx on public.job_matches (user_id, score desc);
create index job_matches_job_idx        on public.job_matches (job_id);

alter table public.job_matches enable row level security;

create policy "job_matches_select_own" on public.job_matches
  for select using (auth.uid() = user_id);
-- Inserts and updates come from server-side (service_role) match workers.

-- =============================================================================
-- 11. saved_jobs
-- =============================================================================
create table if not exists public.saved_jobs (
  user_id  uuid not null references auth.users(id) on delete cascade,
  job_id   uuid not null references public.jobs(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index saved_jobs_user_idx on public.saved_jobs (user_id, saved_at desc);

alter table public.saved_jobs enable row level security;

create policy "saved_jobs_select_own" on public.saved_jobs
  for select using (auth.uid() = user_id);
create policy "saved_jobs_insert_own" on public.saved_jobs
  for insert with check (auth.uid() = user_id);
create policy "saved_jobs_delete_own" on public.saved_jobs
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 12. applications
-- =============================================================================
create type public.application_status as enum (
  'applied', 'recruiter_contacted', 'assessment',
  'interview', 'final_round', 'offer', 'rejected', 'withdrawn'
);

create table if not exists public.applications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  resume_id  uuid references public.resumes(id) on delete set null,
  status     public.application_status not null default 'applied',
  applied_at timestamptz not null default now(),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index applications_user_idx   on public.applications (user_id, applied_at desc);
create index applications_status_idx on public.applications (user_id, status);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

create policy "applications_select_own" on public.applications
  for select using (auth.uid() = user_id);
create policy "applications_insert_own" on public.applications
  for insert with check (auth.uid() = user_id);
create policy "applications_update_own" on public.applications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "applications_delete_own" on public.applications
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 13. application_events — append-only status history
-- =============================================================================
create table if not exists public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         public.application_status not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index application_events_app_idx on public.application_events (application_id, created_at desc);

alter table public.application_events enable row level security;

create policy "application_events_select_own" on public.application_events
  for select using (auth.uid() = user_id);
create policy "application_events_insert_own" on public.application_events
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- 14. push_subscriptions — future Web Push endpoints
-- =============================================================================
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 15. notification_preferences
-- =============================================================================
create table if not exists public.notification_preferences (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  enabled              boolean not null default true,
  minimum_match_score  smallint not null default 85 check (minimum_match_score between 0 and 100),
  notify_fresh_jobs    boolean not null default true,
  notify_remote_jobs   boolean not null default false,
  quiet_hours_start    time,
  quiet_hours_end      time,
  timezone             text not null default 'UTC',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own" on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert with check (auth.uid() = user_id);
create policy "notification_preferences_update_own" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- 16. notifications — per-user notification inbox
-- =============================================================================
create type public.notification_type as enum ('match', 'system', 'application', 'reminder');

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  job_id     uuid references public.jobs(id) on delete set null,
  type       public.notification_type not null default 'system',
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx        on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
-- Notifications are written by server-side workers (service_role).
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- 17. source_sync_runs — operational only; users must NOT see this
-- =============================================================================
create type public.sync_status as enum ('running', 'succeeded', 'failed');

create table if not exists public.source_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.job_sources(id) on delete cascade,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  status         public.sync_status not null default 'running',
  jobs_fetched   integer not null default 0,
  jobs_created   integer not null default 0,
  jobs_updated   integer not null default 0,
  error_message  text
);

create index source_sync_runs_source_idx on public.source_sync_runs (source_id, started_at desc);

alter table public.source_sync_runs enable row level security;
-- No policies granted — only service_role (which bypasses RLS) can read/write.

-- =============================================================================
-- Storage — private resumes bucket
-- =============================================================================
-- Create the bucket if it doesn't already exist. Runs are idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10 * 1024 * 1024, -- 10 MB
  -- V1 accepts only PDF and DOCX. Older `.doc` binaries and `.txt` files
  -- are intentionally rejected — the resume parser (Phase 2) only needs
  -- to reason about these two formats.
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Storage policies: every object path must be `{user_id}/...` so that access
-- can be scoped to the authenticated user via `storage.foldername(name)[1]`.
create policy "resumes_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "resumes_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "resumes_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "resumes_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
