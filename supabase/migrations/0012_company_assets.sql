-- =============================================================================
-- Phase 5C — Company identity assets
-- =============================================================================
-- Additive only. Does not rewrite 0001–0011.
-- Do not apply until the live asset pilot is approved.
--
-- companies.logo_url (0001) stays unused. 5C stores a deterministic
-- Storage path, never a project-specific public URL.
-- Authenticated already has SELECT on companies; new columns are
-- public-safe metadata only (no fetch diagnostics).
-- =============================================================================

alter table public.companies
  add column if not exists logo_status text not null default 'pending';

alter table public.companies
  add column if not exists logo_storage_path text;

alter table public.companies
  add column if not exists logo_updated_at timestamptz;

alter table public.companies
  add column if not exists logo_checked_at timestamptz;

comment on column public.companies.logo_status is
  'pending = not processed; ready = normalized asset stored; unresolved = no trusted domain/icon; failed = retryable processing error.';

comment on column public.companies.logo_storage_path is
  'Object key inside the company-assets bucket, e.g. companies/<id>/logo.webp. Never a full URL.';

comment on column public.companies.logo_url is
  'Legacy unused column from 0001. Phase 5C does not read or write it.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_logo_status_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_logo_status_check
      check (logo_status in ('pending', 'ready', 'unresolved', 'failed'));
  end if;
end $$;

-- Ready must reference a real object key. A NULL or whitespace-only path is
-- an invalid ready state and the CLI would fail to reload from it.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'companies_logo_ready_path_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      drop constraint companies_logo_ready_path_check;
  end if;
  alter table public.companies
    add constraint companies_logo_ready_path_check
    check (
      logo_status <> 'ready'
      or (
        logo_storage_path is not null
        and btrim(logo_storage_path) <> ''
      )
    );
end $$;

create index if not exists companies_logo_status_pending_idx
  on public.companies (logo_status)
  where logo_status in ('pending', 'failed');

-- Writes: no INSERT/UPDATE/DELETE policies for anon or authenticated.
-- service_role bypasses RLS. Do not add a SELECT policy on storage.objects
-- for this bucket (lint 0025 — public URLs work without listing).
-- Do not alter the private resumes bucket or its owner policies.
--
-- Idempotency: an existing company-assets bucket must converge to the exact
-- configuration below. `ON CONFLICT DO NOTHING` would silently accept a
-- misconfigured pre-existing bucket (public=false, wrong size, wider MIME
-- allowlist). This migration only touches columns it owns; owner /
-- created_at / avif_autodetection / other Supabase-managed columns are left
-- unchanged, and no other bucket (e.g. `resumes`) is affected because the
-- conflict target is scoped to id = 'company-assets'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  256 * 1024,
  array['image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
