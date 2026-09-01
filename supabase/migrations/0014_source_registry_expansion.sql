-- =============================================================================
-- Phase 5E — Source registry expansion
-- =============================================================================
-- Additive, idempotent. Does not rewrite 0001–0013. Do not apply
-- automatically. Contents:
--
--   1. Narrow legacy repair for companies incorrectly flipped to
--      logo_status='unresolved' by the pre-fix bulk assets CLI.
--   2. Verified new company + job_sources seeds across Greenhouse /
--      Lever / Ashby. Every identifier below was probed via
--      `pnpm jobs:sources:verify --candidate --provider=<p> --identifier=<id>`
--      on 2026-09-01 against the provider's public host and returned
--      `verified` with a non-zero jobCount. See
--      docs/JOB_SOURCE_REGISTRY_CANDIDATES.md for the verification log.
--
-- What this migration deliberately does NOT contain
-- -------------------------------------------------
--   * Any candidate that did not verify (none in this batch).
--   * Guessed company domains. `companies.domain` is trusted identity
--     data; unverified domain → NULL, initials remain the finished UI
--     fallback.
--   * Non-null domain overwrites. Existing conflicting rows are never
--     silently changed.
--   * Schema changes. `job_sources` already exposes every field the
--     Phase 5E orchestrator needs.
--   * A second WWR source. WWR is a singleton aggregator (0009).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Legacy logo-state repair
-- ---------------------------------------------------------------------------
-- Undo the erroneous `unresolved` state produced when the pre-fix bulk
-- assets CLI walked companies with no trusted domain. Scope is narrow:
--   * logo_status = 'unresolved'
--   * domain IS NULL                    -- no fetch was actually possible
--   * logo_storage_path IS NULL         -- we never uploaded anything
-- A ready logo, or a domain that was tried and failed, is never touched.
update public.companies
   set logo_status  = 'pending',
       logo_checked_at = null
 where logo_status = 'unresolved'
   and domain is null
   and (logo_storage_path is null or btrim(logo_storage_path) = '');


-- ---------------------------------------------------------------------------
-- 2. Verified Lever source expansion
-- ---------------------------------------------------------------------------
insert into public.companies (
  name, name_key, slug, domain, careers_url, ats_provider, ats_identifier, active
)
select seed.name, seed.name_key, seed.slug, seed.domain, seed.careers_url,
       'lever', seed.site, true
from (
  values
    ('HighLevel',              'highlevel',                'highlevel',                null, 'https://jobs.lever.co/gohighlevel',             'gohighlevel'),
    ('AHEAD',                  'ahead',                    'ahead',                    null, 'https://jobs.lever.co/thinkahead',              'thinkahead'),
    ('Everbridge',             'everbridge',               'everbridge',               null, 'https://jobs.lever.co/everbridge',              'everbridge'),
    ('Smart Working Solutions','smart working solutions',  'smart-working-solutions',  null, 'https://jobs.lever.co/smart-working-solutions', 'smart-working-solutions'),
    ('Cprime',                 'cprime',                   'cprime',                   null, 'https://jobs.lever.co/cprime',                  'cprime')
) as seed(name, name_key, slug, domain, careers_url, site)
where not exists (
  select 1 from public.companies existing where existing.slug = seed.slug
);

insert into public.job_sources (
  company_id, name, source_type, base_url, external_identifier, enabled,
  sync_frequency_minutes, status, metadata
)
select c.id, seed.source_name, 'lever',
       'https://api.lever.co/v0/postings',
       seed.site, true, 15, 'active',
       jsonb_build_object(
         'api', 'lever_postings_v0',
         'discovery', 'public_get',
         'auth', 'none',
         'lever_instance', 'global'
       )
from (
  values
    ('highlevel',                'gohighlevel',              'HighLevel'),
    ('ahead',                    'thinkahead',               'AHEAD'),
    ('everbridge',               'everbridge',               'Everbridge'),
    ('smart-working-solutions',  'smart-working-solutions',  'Smart Working Solutions'),
    ('cprime',                   'cprime',                   'Cprime')
) as seed(company_slug, site, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1 from public.job_sources existing
   where existing.source_type = 'lever'
     and lower(btrim(existing.external_identifier)) = seed.site
);


-- ---------------------------------------------------------------------------
-- 3. Verified Greenhouse source expansion
-- ---------------------------------------------------------------------------
insert into public.companies (
  name, name_key, slug, domain, careers_url, ats_provider, ats_identifier, active
)
select seed.name, seed.name_key, seed.slug, seed.domain, seed.careers_url,
       'greenhouse', seed.board_token, true
from (
  values
    ('Remote',                       'remote',                       'remote',                       null, 'https://job-boards.greenhouse.io/remotecom',              'remotecom'),
    ('Twilio',                       'twilio',                       'twilio',                       null, 'https://job-boards.greenhouse.io/twilio',                 'twilio'),
    ('StarTree',                     'startree',                     'startree',                     null, 'https://job-boards.greenhouse.io/startree',               'startree'),
    ('TechGrove by Banyan Software', 'techgrove by banyan software', 'techgrove-banyan-software',    null, 'https://job-boards.greenhouse.io/techgrovebybanyansoftware', 'techgrovebybanyansoftware'),
    ('Pratham International',        'pratham international',        'pratham-international',        null, 'https://job-boards.greenhouse.io/prathaminternational',   'prathaminternational')
) as seed(name, name_key, slug, domain, careers_url, board_token)
where not exists (
  select 1 from public.companies existing where existing.slug = seed.slug
);

insert into public.job_sources (
  company_id, name, source_type, base_url, external_identifier, enabled,
  sync_frequency_minutes, status, metadata
)
select c.id, seed.source_name, 'greenhouse',
       'https://boards-api.greenhouse.io/v1/boards',
       seed.board_token, true, 15, 'active',
       jsonb_build_object(
         'api', 'greenhouse_job_board',
         'discovery', 'public_get',
         'auth', 'none'
       )
from (
  values
    ('remote',                       'remotecom',                 'Remote'),
    ('twilio',                       'twilio',                    'Twilio'),
    ('startree',                     'startree',                  'StarTree'),
    ('techgrove-banyan-software',    'techgrovebybanyansoftware', 'TechGrove by Banyan Software'),
    ('pratham-international',        'prathaminternational',      'Pratham International')
) as seed(company_slug, board_token, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1 from public.job_sources existing
   where existing.source_type = 'greenhouse'
     and lower(btrim(existing.external_identifier)) = seed.board_token
);


-- ---------------------------------------------------------------------------
-- 4. Verified Ashby source expansion
-- ---------------------------------------------------------------------------
insert into public.companies (
  name, name_key, slug, domain, careers_url, ats_provider, ats_identifier, active
)
select seed.name, seed.name_key, seed.slug, seed.domain, seed.careers_url,
       'ashby', seed.board_name, true
from (
  values
    ('Ema',            'ema',             'ema',             null, 'https://jobs.ashbyhq.com/ema',            'ema'),
    ('Emergence',      'emergence',       'emergence',       null, 'https://jobs.ashbyhq.com/emergence',      'emergence'),
    ('PlayPower Labs', 'playpower labs',  'playpower-labs',  null, 'https://jobs.ashbyhq.com/playpowerlabs',  'playpowerlabs'),
    ('Deeptune',       'deeptune',        'deeptune',        null, 'https://jobs.ashbyhq.com/deeptune',       'deeptune'),
    ('Careway',        'careway',         'careway',         null, 'https://jobs.ashbyhq.com/careway',        'careway')
) as seed(name, name_key, slug, domain, careers_url, board_name)
where not exists (
  select 1 from public.companies existing where existing.slug = seed.slug
);

insert into public.job_sources (
  company_id, name, source_type, base_url, external_identifier, enabled,
  sync_frequency_minutes, status, metadata
)
select c.id, seed.source_name, 'ashby',
       'https://api.ashbyhq.com/posting-api/job-board',
       seed.board_name, true, 15, 'active',
       jsonb_build_object(
         'api', 'ashby_public_job_posting',
         'discovery', 'public_get',
         'auth', 'none',
         'include_compensation', true
       )
from (
  values
    ('ema',             'ema',             'Ema'),
    ('emergence',       'emergence',       'Emergence'),
    ('playpower-labs',  'playpowerlabs',   'PlayPower Labs'),
    ('deeptune',        'deeptune',        'Deeptune'),
    ('careway',         'careway',         'Careway')
) as seed(company_slug, board_name, source_name)
join public.companies c on c.slug = seed.company_slug
where not exists (
  select 1 from public.job_sources existing
   where existing.source_type = 'ashby'
     and btrim(existing.external_identifier) = seed.board_name
);
