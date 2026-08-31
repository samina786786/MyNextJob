-- =============================================================================
-- Phase 5A — Job feed foundation (freshness, read hardening, keyset index)
-- =============================================================================
-- Additive. Does not rewrite 0001–0009. Does not add logos, matching,
-- or search. Do not apply automatically.
--
-- freshness_at is a stored generated column:
--   coalesce(published_at, discovered_at)
-- published_at and discovered_at keep their existing meanings.
-- =============================================================================

-- Derived catalog freshness. Not a source of truth.
alter table public.jobs
  add column if not exists freshness_at timestamptz
  generated always as (coalesce(published_at, discovered_at)) stored;

comment on column public.jobs.freshness_at is
  'Active-catalog freshness: coalesce(published_at, discovered_at). Do not write. Feed and cleanup read this.';

-- Keyset feed: open jobs ordered by freshness_at DESC, id DESC.
-- Predicate matches the production feed filter (status = open).
-- Freshness cutoff uses now() and cannot live in the index predicate.
drop index if exists public.jobs_open_freshness_id_idx;
create index jobs_open_freshness_id_idx
  on public.jobs (freshness_at desc, id desc)
  where status = 'open';

-- Cleanup needs DELETE. 0005 granted select/insert/update only.
grant delete on table public.jobs to service_role;
grant delete on table public.job_source_postings to service_role;

-- Authenticated users may read feed-safe job columns only.
-- Internal ingestion fields stay service_role.
revoke select on table public.jobs from authenticated, anon, public;

grant select (
  id,
  company_id,
  title,
  slug,
  description_html,
  description_text,
  location_text,
  country,
  city,
  remote_type,
  employment_type,
  experience_min,
  experience_max,
  salary_min,
  salary_max,
  salary_currency,
  salary_period,
  published_at,
  discovered_at,
  freshness_at,
  last_seen_at,
  status,
  apply_url,
  source_url,
  created_at,
  updated_at
) on table public.jobs to authenticated;

comment on table public.jobs is
  'Canonical job openings. Authenticated SELECT is column-limited: no raw_payload, fingerprint, content_hash, source identity, or miss counters.';
