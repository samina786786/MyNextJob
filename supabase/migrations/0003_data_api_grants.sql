-- =============================================================================
-- Phase 1.1 — Explicit Data API grants
-- =============================================================================
-- New Supabase projects no longer auto-grant public tables to anon /
-- authenticated. RLS already exists in 0001; this file only exposes the
-- privileges those policies assume. Do not grant user-owned tables to anon.
-- source_sync_runs stays server-only (no grants).
-- =============================================================================

grant usage on schema public to authenticated;

-- User-owned (RLS owner policies already exist)
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.resumes to authenticated;
grant select, insert, update, delete on table public.job_preferences to authenticated;
grant select, insert, update, delete on table public.resume_skills to authenticated;
grant select, insert, delete on table public.saved_jobs to authenticated;
grant select, insert, update, delete on table public.applications to authenticated;
grant select, insert on table public.application_events to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant select, update on table public.notifications to authenticated;
grant select on table public.job_matches to authenticated;

-- Shared catalogs: authenticated read, writes stay service_role
grant select on table public.companies to authenticated;
grant select on table public.job_sources to authenticated;
grant select on table public.jobs to authenticated;
grant select on table public.skills to authenticated;
grant select on table public.job_skills to authenticated;

-- Trigger function must not be a public RPC (0002 creates it)
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;
end
$$;
