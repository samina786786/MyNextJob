-- =============================================================================
-- Phase 4A — Curated Greenhouse Job Board sources
-- =============================================================================
-- Seeds a small, live-verified Greenhouse company/source set for QA.
-- No Greenhouse-specific tables. No cron. Does not overwrite curated
-- company display names. Safe to re-run: inserts are existence-guarded.
--
-- Do not apply automatically. Review, then paste into the SQL Editor
-- after 0005, or `supabase db push` when ready.
-- =============================================================================

-- Greenhouse board tokens only. Do not apply case-insensitive identifier
-- uniqueness to providers that are not implemented yet.
create unique index if not exists job_sources_greenhouse_external_lower_uidx
  on public.job_sources (lower(btrim(external_identifier)))
  where source_type = 'greenhouse'
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
  'greenhouse',
  seed.board_token,
  true
from (
  values
    (
      'Dscout',
      'dscout',
      'dscout',
      'dscout.com',
      'https://job-boards.greenhouse.io/dscout',
      'dscout'
    ),
    (
      'AlphaSense',
      'alphasense',
      'alphasense',
      'alpha-sense.com',
      'https://job-boards.greenhouse.io/alphasense',
      'alphasense'
    ),
    (
      'Turing',
      'turing',
      'turing',
      'turing.com',
      'https://job-boards.greenhouse.io/turing',
      'turing'
    ),
    (
      'PayPay India',
      'paypay india',
      'paypay-india',
      null,
      'https://job-boards.greenhouse.io/pay2dc',
      'pay2dc'
    ),
    (
      'Karat',
      'karat',
      'karat',
      'karat.com',
      'https://job-boards.greenhouse.io/karat',
      'karat'
    )
) as seed(name, name_key, slug, domain, careers_url, board_token)
where not exists (
  select 1
  from public.companies existing
  where existing.slug = seed.slug
);

-- -----------------------------------------------------------------------------
-- Job sources. Board token lives on external_identifier.
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
  'greenhouse',
  'https://boards-api.greenhouse.io/v1/boards',
  seed.board_token,
  true,
  15,
  'active',
  jsonb_build_object(
    'api', 'greenhouse_job_board',
    'discovery', 'public_get',
    'auth', 'none'
  )
from (
  values
    ('dscout', 'dscout', 'Dscout'),
    ('alphasense', 'alphasense', 'AlphaSense'),
    ('turing', 'turing', 'Turing'),
    ('paypay-india', 'pay2dc', 'PayPay India'),
    ('karat', 'karat', 'Karat')
) as seed(company_slug, board_token, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1
  from public.job_sources existing
  where existing.source_type = 'greenhouse'
    and lower(btrim(existing.external_identifier)) = seed.board_token
);
