-- =============================================================================
-- Phase 4D — We Work Remotely official all-jobs RSS source
-- =============================================================================
-- Seeds one global RSS source. WWR is a publisher, not a canonical
-- employer, so job_sources.company_id is NULL.
-- No WWR-specific tables. No category feeds. No cron.
-- Safe to re-run: inserts are existence-guarded.
--
-- source_type = we_work_remotely already exists on the live enum (0001).
-- Canonical jobs resolve per-item employers through the generic engine.
--
-- Do not apply automatically. Review, then paste into the SQL Editor
-- after 0008, or `supabase db push` when ready.
-- =============================================================================

create unique index if not exists job_sources_wwr_external_uidx
  on public.job_sources (btrim(external_identifier))
  where source_type = 'we_work_remotely'
    and external_identifier is not null
    and btrim(external_identifier) <> '';

insert into public.job_sources (
  company_id,
  name,
  source_type,
  base_url,
  external_identifier,
  enabled,
  sync_frequency_minutes,
  status,
  metadata
)
select
  null::uuid,
  'We Work Remotely — All Jobs',
  'we_work_remotely',
  'https://weworkremotely.com/remote-jobs.rss',
  'weworkremotely-all',
  true,
  30,
  'active',
  jsonb_build_object(
    'provider', 'we_work_remotely',
    'format', 'rss',
    'feed', 'all_jobs',
    'auth', 'none',
    'attribution_required', true
  )
where not exists (
  select 1
  from public.job_sources existing
  where existing.source_type = 'we_work_remotely'
    and btrim(existing.external_identifier) = 'weworkremotely-all'
);
