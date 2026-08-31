-- =============================================================================
-- Phase 4C — Curated Ashby Public Job Posting API sources
-- =============================================================================
-- Seeds a small, live-verified Ashby company/source set for QA.
-- No Ashby-specific tables. No cron. Does not overwrite curated
-- company display names. Safe to re-run: inserts are existence-guarded.
--
-- source_type = ashby already exists on the live enum (0001).
-- Do not add enum values here.
--
-- Ashby board names are stored exactly as the public path segment.
-- Uniqueness is exact (after trim), not lowercased — live API testing
-- did not prove case-insensitive identity.
--
-- WarpBuild (warpbuild) was a candidate but the public API returned 404
-- at verification time and is not seeded.
--
-- Do not apply automatically. Review, then paste into the SQL Editor
-- after 0007, or `supabase db push` when ready.
-- =============================================================================

-- Ashby board names only. Do not apply this uniqueness to other providers.
create unique index if not exists job_sources_ashby_external_uidx
  on public.job_sources (btrim(external_identifier))
  where source_type = 'ashby'
    and external_identifier is not null
    and btrim(external_identifier) <> '';

-- -----------------------------------------------------------------------------
-- Companies (stable slugs). Domain only when confidently known.
-- -----------------------------------------------------------------------------
insert into public.companies (
  name,
  name_key,
  slug,
  domain,
  careers_url,
  ats_provider,
  ats_identifier,
  active
)
select
  seed.name,
  seed.name_key,
  seed.slug,
  seed.domain,
  seed.careers_url,
  'ashby',
  seed.board,
  true
from (
  values
    (
      'Juniper Square',
      'juniper square',
      'junipersquare',
      'junipersquare.com',
      'https://jobs.ashbyhq.com/junipersquare',
      'junipersquare'
    ),
    (
      'Granica',
      'granica',
      'granica',
      'granica.ai',
      'https://jobs.ashbyhq.com/granica',
      'granica'
    ),
    (
      'TRM Labs',
      'trm labs',
      'trm-labs',
      'trmlabs.com',
      'https://jobs.ashbyhq.com/trm-labs',
      'trm-labs'
    ),
    (
      'Mem0',
      'mem0',
      'mem0',
      'mem0.ai',
      'https://jobs.ashbyhq.com/mem0',
      'mem0'
    )
) as seed(name, name_key, slug, domain, careers_url, board)
where not exists (
  select 1
  from public.companies existing
  where existing.slug = seed.slug
);

-- -----------------------------------------------------------------------------
-- Job sources. Board name lives on external_identifier.
-- Ingestion always calls https://api.ashbyhq.com — never an arbitrary host.
-- -----------------------------------------------------------------------------
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
  c.id,
  seed.source_name,
  'ashby',
  'https://api.ashbyhq.com/posting-api/job-board',
  seed.board,
  true,
  15,
  'active',
  jsonb_build_object(
    'api', 'ashby_public_job_posting',
    'discovery', 'public_get',
    'auth', 'none',
    'include_compensation', true
  )
from (
  values
    ('junipersquare', 'junipersquare', 'Juniper Square'),
    ('granica', 'granica', 'Granica'),
    ('trm-labs', 'trm-labs', 'TRM Labs'),
    ('mem0', 'mem0', 'Mem0')
) as seed(company_slug, board, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1
  from public.job_sources existing
  where existing.source_type = 'ashby'
    and btrim(existing.external_identifier) = seed.board
);
