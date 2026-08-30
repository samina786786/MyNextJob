import { createClient } from '@/lib/supabase/server';
import type { ParsedResumeV1 } from '@/lib/resume/types';
import type { OnboardingSnapshot, ParseStatus } from './progress';

export interface ResumeRecord {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  parse_status: ParseStatus;
  parsed_content: ParsedResumeV1 | null;
  created_at: string;
  updated_at: string;
}

export interface SkillOption {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
}

export interface JobPreferencesRecord {
  target_roles: string[] | null;
  preferred_locations: string[] | null;
  work_modes: string[] | null;
  employment_types: string[] | null;
  minimum_salary: number | null;
  currency: string | null;
  minimum_match_score: number | null;
  excluded_keywords: string[] | null;
}

export async function loadOnboardingSnapshot(userId: string): Promise<OnboardingSnapshot> {
  const supabase = await createClient();
  const [{ data: profile }, { data: resume }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, headline, years_experience, city, country, onboarding_completed')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('resumes')
      .select('parse_status')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle(),
  ]);

  return {
    onboardingCompleted: Boolean(profile?.onboarding_completed),
    fullName: profile?.full_name ?? null,
    headline: profile?.headline ?? null,
    yearsExperience: profile?.years_experience ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    hasSucceededResume: resume?.parse_status === 'succeeded',
    resumeParseStatus: (resume?.parse_status as ParseStatus | undefined) ?? null,
  };
}

export async function loadDefaultResume(userId: string): Promise<ResumeRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('resumes')
    .select(
      'id, original_filename, storage_path, mime_type, file_size, parse_status, parsed_content, created_at, updated_at',
    )
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  return (data as ResumeRecord | null) ?? null;
}

export async function loadSkillsCatalog(): Promise<SkillOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('skills').select('id, name, aliases, category').order('name');
  return (data as SkillOption[] | null) ?? [];
}

export async function loadResumeSkillIds(resumeId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('resume_skills').select('skill_id').eq('resume_id', resumeId);
  return (data ?? []).map((row) => row.skill_id as string);
}

export async function loadJobPreferences(userId: string): Promise<JobPreferencesRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('job_preferences')
    .select(
      'target_roles, preferred_locations, work_modes, employment_types, minimum_salary, currency, minimum_match_score, excluded_keywords',
    )
    .eq('user_id', userId)
    .maybeSingle();
  return (data as JobPreferencesRecord | null) ?? null;
}

export async function loadConfirmedSkillNames(userId: string): Promise<string[]> {
  const resume = await loadDefaultResume(userId);
  if (!resume) return [];
  const [ids, catalog] = await Promise.all([loadResumeSkillIds(resume.id), loadSkillsCatalog()]);
  const selected = new Set(ids);
  return catalog.filter((skill) => selected.has(skill.id)).map((skill) => skill.name);
}
