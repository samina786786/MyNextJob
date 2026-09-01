-- =============================================================================
-- Phase 5A — Client grant hardening
-- =============================================================================
-- Additive. Does NOT edit 0010.
-- Do not apply automatically.
--
-- Why leftovers exist:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public currently
--   grants TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (Dxtm) to anon,
--   authenticated, and service_role on every new table. CREATE TABLE
--   therefore stamps those privileges even when later GRANT/REVOKE only
--   mention SELECT/INSERT/UPDATE/DELETE. 0005 stripped DML from catalogs
--   and REVOKE ALL on ingestion tables; 0010 stripped table SELECT on
--   jobs. Dxtm remained. information_schema often omits MAINTAIN; it is
--   visible on pg_class.relacl as "m".
--
-- ON ALL TABLES IN SCHEMA public affects only the named roles — not
-- service_role. It does not revoke SELECT/INSERT/UPDATE/DELETE.
-- Do not REVOKE ALL from authenticated on jobs — that drops 0010
-- column-level SELECT.
-- =============================================================================

-- Existing tables: strip infrastructure privileges from browser roles.
revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated, public;

-- Future tables created by the migration role (postgres).
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- jobs: keep 0010 column-level SELECT. No anon access. No client DML.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table public.jobs
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

-- job_sources: authenticated SELECT kept (0003/0005 catalog; 5D attribution).
revoke insert, update, delete on table public.job_sources
  from anon, authenticated, public;
revoke select on table public.job_sources from anon, public;
grant select on table public.job_sources to authenticated;

-- companies: authenticated SELECT kept (feed company name / 5C logos).
revoke insert, update, delete on table public.companies
  from anon, authenticated, public;
revoke select on table public.companies from anon, public;
grant select on table public.companies to authenticated;

comment on table public.jobs is
  'Canonical job openings. Authenticated SELECT is column-limited (0010). Client roles have no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (0011).';
