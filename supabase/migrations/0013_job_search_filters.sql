-- =============================================================================
-- Phase 5D — Job search & filter indexes
-- =============================================================================
-- Additive only. Does not rewrite 0001–0012. Do not apply automatically.
--
-- Scope
-- -----
-- Phase 5D enables lexical catalog search over `jobs.title` and
-- `companies.name` plus location free-text (`location_text` / `city` /
-- `country`) and categorical filters (work mode, employment type,
-- freshness age). The read path stays keyset-sorted by
-- `(freshness_at DESC, id DESC)` and always applies `status='open'` +
-- the 30-day catalog window.
--
-- Actual runtime predicate shape
-- ------------------------------
-- The server repository uses Supabase/PostgREST helper methods; PostgREST
-- emits `col ILIKE '%value%'` — a **native** case-insensitive LIKE on the
-- raw column. The `*` wildcard from the URL grammar is converted to `%`
-- during URL parsing. Predicates from src/lib/jobs/feed/supabase-feed.ts:
--
--   .ilike('name', '%…%')                      -- companies preflight
--   .or('title.ilike.*…*')                     -- title search leg
--   .or('company_id.in.(…)')                   -- company preflight leg
--   .or('location_text.ilike.*…*, city.ilike.*…*, country.ilike.*…*')
--
-- All ILIKE predicates target the raw column, NOT `lower(col)`. The
-- previous revision of this migration indexed `lower(col) gin_trgm_ops`,
-- which the planner cannot use for a raw-column ILIKE predicate because
-- expression indexes only match the exact expression they were built on.
--
-- pg_trgm operator support
-- ------------------------
-- Per the PostgreSQL manual for the pg_trgm extension:
--
--   "The gin_trgm_ops operator class supports these operators: LIKE (~~),
--    ILIKE (~~*), regex match (~ and ~*), and (starting with PostgreSQL 9.1)
--    similarity (%)."
--
-- So a GIN on `title gin_trgm_ops` (raw column) is directly usable for
-- `title ILIKE '%q%'`. That is what this migration builds. The planner
-- will still choose Seq Scan on tiny catalogs (the current 126-row local
-- catalog); at Phase 5E scale (~5–10k rows) the trigram GIN starts to
-- pay for itself.
--
-- Deliberate exclusions
-- ---------------------
--   * No `search_document` tsvector column. The corpus is small,
--     single-language, and title-focused; trigram ILIKE is sufficient.
--   * No description_text search index. Description bodies are large and
--     description search is deferred (documented in
--     docs/JOB_SEARCH_FILTERS.md).
--   * No bare `employment_type` index. See the ratio in
--     docs/JOB_SEARCH_FILTERS.md — that decision is about cardinality,
--     current catalog size, and the low residual-filter cost, not about
--     LIMIT trimming the working set.
--   * No SECURITY DEFINER RPC. The server repository builds queries with
--     parameterized PostgREST helpers; the browser never speaks to
--     PostgREST directly.
-- =============================================================================

create extension if not exists "pg_trgm";

-- ------------------------------------------------------------------------------
-- Title search
-- ------------------------------------------------------------------------------
-- Supports: WHERE title ILIKE '%…%'      (Bitmap Index Scan on jobs_title_trgm_idx)
drop index if exists public.jobs_title_trgm_idx;
create index jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- Company-name search
-- ------------------------------------------------------------------------------
-- Supports: WHERE name ILIKE '%…%'       (companies preflight)
drop index if exists public.companies_name_trgm_idx;
create index companies_name_trgm_idx
  on public.companies using gin (name gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- Location free-text
-- ------------------------------------------------------------------------------
-- Supports: WHERE location_text ILIKE '%…%' OR city ILIKE '%…%' OR country ILIKE '%…%'
-- Partial indexes skip nulls, which are common on these columns.
drop index if exists public.jobs_location_text_trgm_idx;
create index jobs_location_text_trgm_idx
  on public.jobs using gin (location_text gin_trgm_ops)
  where location_text is not null;

drop index if exists public.jobs_city_trgm_idx;
create index jobs_city_trgm_idx
  on public.jobs using gin (city gin_trgm_ops)
  where city is not null;

drop index if exists public.jobs_country_trgm_idx;
create index jobs_country_trgm_idx
  on public.jobs using gin (country gin_trgm_ops)
  where country is not null;

-- ------------------------------------------------------------------------------
-- Work-mode + freshness composite
-- ------------------------------------------------------------------------------
-- Supports: WHERE status='open' AND remote_type = ANY(...)
--           ORDER BY freshness_at DESC, id DESC
-- The bare `remote_type` cardinality is tiny (remote/hybrid/onsite/any),
-- but a partial composite (remote_type, freshness_at DESC, id DESC)
-- WHERE status='open' lets the planner walk directly to the newest
-- matching rows for a filtered work-mode.
drop index if exists public.jobs_open_remote_freshness_idx;
create index jobs_open_remote_freshness_idx
  on public.jobs (remote_type, freshness_at desc, id desc)
  where status = 'open';

-- ------------------------------------------------------------------------------
-- Grants (unchanged)
-- ------------------------------------------------------------------------------
-- No new columns are added to the authenticated SELECT list. The server
-- repository always runs through the service-role admin client behind
-- the shared cache — `authenticated` still SELECTs the column-limited
-- 0010 set.
