-- =============================================================================
-- Phase 4B — Curated Lever Postings API sources
-- =============================================================================
-- Seeds a small, live-verified Lever company/source set for QA.
-- No Lever-specific tables. No cron. Does not overwrite curated
-- company display names. Safe to re-run: inserts are existence-guarded.
--
-- Do not apply automatically. Review, then paste into the SQL Editor
-- after 0006, or `supabase db push` when ready.
-- =============================================================================

-- Lever site identifiers only. Do not apply this uniqueness to other providers.
create unique index if not exists job_sources_lever_external_lower_uidx
  on public.job_sources (lower(btrim(external_identifier)))
  where source_type = 'lever'
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
  'lever',
  seed.site,
  true
from (
  values
    (
      'Drivetrain',
      'drivetrain',
      'drivetrain',
      'drivetrain.ai',
      'https://jobs.lever.co/drivetrain',
      'drivetrain'
    ),
    (
      'Netomi',
      'netomi',
      'netomi',
      'netomi.com',
      'https://jobs.lever.co/netomi',
      'netomi'
    ),
    (
      'JumpCloud',
      'jumpcloud',
      'jumpcloud',
      'jumpcloud.com',
      'https://jobs.lever.co/jumpcloud',
      'jumpcloud'
    ),
    (
      'H1',
      'h1',
      'h1',
      'h1.com',
      'https://jobs.lever.co/h1',
      'h1'
    ),
    (
      '3Pillar',
      '3pillar',
      '3pillar',
      '3pillarglobal.com',
      'https://jobs.lever.co/3pillarglobal',
      '3pillarglobal'
    )
) as seed(name, name_key, slug, domain, careers_url, site)
where not exists (
  select 1
  from public.companies existing
  where existing.slug = seed.slug
);

-- -----------------------------------------------------------------------------
-- Job sources. Site identifier lives on external_identifier.
-- Instance is controlled metadata, never an arbitrary hostname.
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
  'lever',
  'https://api.lever.co/v0/postings',
  seed.site,
  true,
  15,
  'active',
  jsonb_build_object(
    'api', 'lever_postings_v0',
    'discovery', 'public_get',
    'auth', 'none',
    'lever_instance', 'global'
  )
from (
  values
    ('drivetrain', 'drivetrain', 'Drivetrain'),
    ('netomi', 'netomi', 'Netomi'),
    ('jumpcloud', 'jumpcloud', 'JumpCloud'),
    ('h1', 'h1', 'H1'),
    ('3pillar', '3pillarglobal', '3Pillar')
) as seed(company_slug, site, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1
  from public.job_sources existing
  where existing.source_type = 'lever'
    and lower(btrim(existing.external_identifier)) = seed.site
);
