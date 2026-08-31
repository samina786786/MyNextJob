-- =============================================================================
-- Phase 5A — Client grant hardening (jobs + ingestion tables)
-- =============================================================================
-- Additive. Does NOT edit 0010.
-- Do not apply automatically.
--
-- History:
--   Supabase table create left ALL-style leftovers on client roles
--   (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN).
--   0003 granted authenticated SELECT on jobs and job_sources.
--   0005 revoked INSERT/UPDATE/DELETE from client roles on those catalogs
--   and REVOKE ALL on job_source_postings / source_sync_runs.
--   0010 revoked table-level SELECT on jobs and granted column-level
--   SELECT to authenticated only.
--   Leftover Dxtm (and column REFERENCES) remained on jobs / job_sources.
--
-- Do not REVOKE ALL from authenticated on jobs — that would drop 0010
-- column-level SELECT.
-- =============================================================================

-- jobs: strip unused table privileges from client roles. Keep 0010 columns.
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.jobs
  from anon, authenticated, public;

revoke select on table public.jobs from anon, public;

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

-- Ingestion evidence: server-only. Idempotent with 0005.
revoke all on table public.job_source_postings from anon, authenticated, public;
revoke all on table public.source_sync_runs from anon, authenticated, public;

-- job_sources: keep authenticated SELECT (0003/0005 catalog grant; no
-- current client query, but 5D attribution may read names). Strip unused
-- mutation/DDL leftovers. anon stays without SELECT.
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.job_sources
  from anon, authenticated, public;

revoke select on table public.job_sources from anon, public;

grant select on table public.job_sources to authenticated;

comment on table public.jobs is
  'Canonical job openings. Authenticated SELECT is column-limited (0010). Client roles have no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (0011).';
