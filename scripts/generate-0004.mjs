import { writeFileSync } from 'node:fs';
import { SKILL_CATALOG } from '../src/lib/skills/catalog.ts';

function esc(value) {
  return value.replaceAll("'", "''");
}

const rows = SKILL_CATALOG.map((skill) => {
  const aliases = skill.aliases.map((alias) => `'${esc(alias)}'`).join(', ');
  const aliasSql = aliases.length > 0 ? `array[${aliases}]` : `'{}'::text[]`;
  return `  ('${esc(skill.name)}', '${esc(skill.slug)}', ${aliasSql}, '${esc(skill.category)}')`;
}).join(',\n');

const sql = `-- =============================================================================
-- Phase 2 — Profile / resume onboarding
-- =============================================================================
-- Additive only. Does not rewrite 0001–0003.
-- Apply in the SQL Editor after 0001–0003.
-- Automatically expose new tables = OFF: grants below are explicit and
-- least-privilege. No anon grants.
-- =============================================================================

alter type public.employment_type add value if not exists 'freelance';

alter table public.job_preferences
  alter column minimum_match_score set default 75;

-- One default resume per user already exists as resumes_one_default_per_user.

insert into public.skills (name, slug, aliases, category)
values
${rows}
on conflict (slug) do update
  set name = excluded.name,
      aliases = excluded.aliases,
      category = excluded.category,
      updated_at = now();

grant select on table public.skills to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.resumes to authenticated;
grant select, insert, update, delete on table public.resume_skills to authenticated;
grant select, insert, update, delete on table public.job_preferences to authenticated;
`;

writeFileSync(new URL('../supabase/migrations/0004_profile_resume_onboarding.sql', import.meta.url), sql);
console.log(`wrote 0004 with ${SKILL_CATALOG.length} skills`);
