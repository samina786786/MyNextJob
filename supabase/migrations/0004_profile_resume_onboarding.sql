-- =============================================================================
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
  ('JavaScript', 'javascript', array['js', 'ecmascript'], 'language'),
  ('TypeScript', 'typescript', array['ts'], 'language'),
  ('HTML', 'html', array['html5'], 'language'),
  ('CSS', 'css', array['css3'], 'language'),
  ('Java', 'java', '{}'::text[], 'language'),
  ('Python', 'python', '{}'::text[], 'language'),
  ('C#', 'csharp', array['c sharp', 'csharp'], 'language'),
  ('C++', 'cpp', array['cplusplus', 'c plus plus'], 'language'),
  ('SQL', 'sql', '{}'::text[], 'language'),
  ('Go', 'go', array['golang'], 'language'),
  ('Rust', 'rust', '{}'::text[], 'language'),
  ('PHP', 'php', '{}'::text[], 'language'),
  ('Ruby', 'ruby', '{}'::text[], 'language'),
  ('Swift', 'swift', '{}'::text[], 'language'),
  ('Kotlin', 'kotlin', '{}'::text[], 'language'),
  ('React', 'react', array['react.js', 'reactjs', 'react js'], 'frontend'),
  ('Next.js', 'nextjs', array['nextjs', 'next js'], 'frontend'),
  ('Angular', 'angular', array['angularjs', 'angular.js'], 'frontend'),
  ('Vue', 'vue', array['vue.js', 'vuejs', 'vue js'], 'frontend'),
  ('Redux', 'redux', '{}'::text[], 'frontend'),
  ('Redux Toolkit', 'redux-toolkit', array['rtk', 'redux-toolkit'], 'frontend'),
  ('RTK Query', 'rtk-query', array['rtkquery'], 'frontend'),
  ('Tailwind CSS', 'tailwindcss', array['tailwind', 'tailwindcss'], 'frontend'),
  ('Material UI', 'material-ui', array['mui', 'material-ui', 'materialui'], 'frontend'),
  ('shadcn/ui', 'shadcn-ui', array['shadcn', 'shadcn ui'], 'frontend'),
  ('Radix UI', 'radix-ui', array['radix', 'radixui'], 'frontend'),
  ('SCSS', 'scss', array['sass'], 'frontend'),
  ('Vite', 'vite', '{}'::text[], 'frontend'),
  ('Webpack', 'webpack', '{}'::text[], 'frontend'),
  ('React Native', 'react-native', array['reactnative', 'react-native'], 'mobile'),
  ('Expo', 'expo', '{}'::text[], 'mobile'),
  ('Flutter', 'flutter', '{}'::text[], 'mobile'),
  ('Android', 'android', '{}'::text[], 'mobile'),
  ('iOS', 'ios', '{}'::text[], 'mobile'),
  ('Node.js', 'nodejs', array['node', 'nodejs', 'node js'], 'backend'),
  ('Express', 'express', array['express.js', 'expressjs'], 'backend'),
  ('NestJS', 'nestjs', array['nest.js', 'nest'], 'backend'),
  ('REST API', 'rest-api', array['rest', 'restful', 'rest apis'], 'backend'),
  ('GraphQL', 'graphql', '{}'::text[], 'backend'),
  ('WebSocket', 'websocket', array['websockets'], 'backend'),
  ('PostgreSQL', 'postgresql', array['postgres', 'psql'], 'database'),
  ('MongoDB', 'mongodb', array['mongo'], 'database'),
  ('Redis', 'redis', '{}'::text[], 'database'),
  ('Supabase', 'supabase', '{}'::text[], 'database'),
  ('Firebase', 'firebase', '{}'::text[], 'database'),
  ('MySQL', 'mysql', '{}'::text[], 'database'),
  ('Prisma', 'prisma', '{}'::text[], 'database'),
  ('AWS', 'aws', array['amazon web services'], 'cloud'),
  ('Azure', 'azure', array['microsoft azure'], 'cloud'),
  ('GCP', 'gcp', array['google cloud', 'google cloud platform'], 'cloud'),
  ('Docker', 'docker', '{}'::text[], 'cloud'),
  ('Kubernetes', 'kubernetes', array['k8s'], 'cloud'),
  ('CI/CD', 'ci-cd', array['cicd', 'continuous integration'], 'cloud'),
  ('GitHub Actions', 'github-actions', array['gh actions'], 'cloud'),
  ('Terraform', 'terraform', '{}'::text[], 'cloud'),
  ('Linux', 'linux', '{}'::text[], 'cloud'),
  ('Git', 'git', '{}'::text[], 'cloud'),
  ('Jest', 'jest', '{}'::text[], 'testing'),
  ('Vitest', 'vitest', '{}'::text[], 'testing'),
  ('Playwright', 'playwright', '{}'::text[], 'testing'),
  ('Cypress', 'cypress', '{}'::text[], 'testing'),
  ('React Testing Library', 'react-testing-library', array['rtl', 'testing-library'], 'testing'),
  ('Accessibility', 'accessibility', array['a11y'], 'web'),
  ('WCAG', 'wcag', '{}'::text[], 'web'),
  ('SEO', 'seo', '{}'::text[], 'web'),
  ('Motion', 'motion', array['framer motion', 'framer-motion', 'motion/react'], 'web'),
  ('GSAP', 'gsap', array['greensock'], 'web'),
  ('Three.js', 'threejs', array['threejs', 'three js'], 'web'),
  ('Mapbox', 'mapbox', '{}'::text[], 'web'),
  ('.NET', 'dotnet', array['dotnet', 'dot net', 'asp.net'], 'backend'),
  ('Figma', 'figma', '{}'::text[], 'web'),
  ('Storybook', 'storybook', '{}'::text[], 'frontend'),
  ('ESLint', 'eslint', '{}'::text[], 'frontend'),
  ('pnpm', 'pnpm', '{}'::text[], 'cloud'),
  ('Vercel', 'vercel', '{}'::text[], 'cloud')
on conflict (slug) do update
  set name = excluded.name,
      aliases = excluded.aliases,
      category = excluded.category,
      updated_at = now();

-- Shared taxonomy is readable; authenticated users must not mutate it.
revoke insert, update, delete on table public.skills from anon, authenticated, public;
grant select on table public.skills to authenticated;

-- User-owned tables (idempotent with 0003). RLS still filters to owner rows.
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.resumes to authenticated;
grant select, insert, update, delete on table public.resume_skills to authenticated;
grant select, insert, update, delete on table public.job_preferences to authenticated;
