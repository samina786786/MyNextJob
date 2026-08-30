'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { logResumeParse, parseResumeBuffer } from '@/lib/resume/parse-resume';
import { assertOwnedStoragePath, buildResumeStoragePath, displayFilename } from '@/lib/resume/storage-path';
import { validateResumeBytes, validateResumeMetadata } from '@/lib/resume/validate-file';
import { parsePreferencesFormData } from '@/lib/validation/preferences';
import { profileReviewSchema } from '@/lib/validation/profile';
import type { ParsedResumeV1 } from '@/lib/resume/types';

export interface ActionResult {
  error?: string;
  resumeId?: string;
  status?: 'uploaded' | 'parsed' | 'busy';
}

export async function registerResumeUpload(input: {
  resumeId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<ActionResult> {
  const identity = await requireAuth('/onboarding/resume');
  const meta = validateResumeMetadata({
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
  });
  if (!meta.ok) return { error: meta.message };

  const expectedPath = buildResumeStoragePath(identity.userId, input.resumeId, meta.mimeType);
  if (input.storagePath !== expectedPath) {
    return { error: 'That resume could not be saved.' };
  }
  assertOwnedStoragePath(identity.userId, input.storagePath);

  const supabase = await createClient();
  const { data: previous } = await supabase
    .from('resumes')
    .select('id')
    .eq('user_id', identity.userId)
    .eq('is_default', true)
    .maybeSingle();

  await supabase.from('resumes').update({ is_default: false }).eq('user_id', identity.userId).eq('is_default', true);

  const { error } = await supabase.from('resumes').insert({
    id: input.resumeId,
    user_id: identity.userId,
    label: 'My resume',
    original_filename: displayFilename(meta.filename),
    storage_path: expectedPath,
    mime_type: meta.mimeType,
    file_size: meta.size,
    is_default: true,
    parse_status: 'pending',
  });

  if (error) {
    await supabase.storage.from('resumes').remove([expectedPath]);
    if (previous?.id) {
      await supabase.from('resumes').update({ is_default: true }).eq('id', previous.id).eq('user_id', identity.userId);
    }
    return { error: 'We saved the file but could not record it. Please try again.' };
  }

  revalidatePath('/onboarding/resume');
  revalidatePath('/profile');
  return { resumeId: input.resumeId, status: 'uploaded' };
}

export async function parseDefaultResumeAction(options: { force?: boolean } = {}): Promise<ActionResult> {
  const identity = await requireAuth('/onboarding/resume');
  const supabase = await createClient();
  const { data: resume } = await supabase
    .from('resumes')
    .select('id, storage_path, mime_type, parse_status')
    .eq('user_id', identity.userId)
    .eq('is_default', true)
    .maybeSingle();

  if (!resume) return { error: 'Upload a resume first.' };
  if (resume.parse_status === 'processing' && !options.force) return { status: 'busy' };

  const started = Date.now();
  const parserKind = resume.mime_type.includes('pdf') ? 'pdf' : 'docx';
  logResumeParse('resume_parse_started', {
    resumeId: resume.id,
    userId: identity.userId,
    parser: parserKind,
  });

  const { data: claimed } = await supabase
    .from('resumes')
    .update({ parse_status: 'processing' })
    .eq('id', resume.id)
    .eq('user_id', identity.userId)
    .in('parse_status', options.force ? ['pending', 'failed', 'succeeded', 'processing'] : ['pending', 'failed', 'succeeded'])
    .select('id')
    .maybeSingle();

  if (!claimed) return { status: 'busy' };

  const { data: file, error: downloadError } = await supabase.storage.from('resumes').download(resume.storage_path);
  if (downloadError || !file) {
    await failParse(resume.id, identity.userId, started, parserKind);
    return { error: "We couldn't read this resume." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = validateResumeBytes(bytes, resume.mime_type);
  if (!signature.ok) {
    await failParse(resume.id, identity.userId, started, parserKind);
    return { error: signature.message };
  }

  const { data: skills } = await supabase.from('skills').select('id, name, aliases');
  let parsed: ParsedResumeV1 | { code: string; message: string };
  try {
    parsed = await parseResumeBuffer(
      bytes,
      signature.mimeType,
      (skills ?? []).map((skill) => ({
        id: skill.id as string,
        name: skill.name as string,
        aliases: (skill.aliases as string[] | null) ?? [],
      })),
    );
  } catch {
    await failParse(resume.id, identity.userId, started, parserKind);
    return { error: "We couldn't read this file." };
  }

  if ('code' in parsed) {
    await failParse(resume.id, identity.userId, started, parserKind);
    return { error: parsed.message };
  }

  await persistParseResult(identity.userId, resume.id, parsed);
  logResumeParse('resume_parse_completed', {
    resumeId: resume.id,
    userId: identity.userId,
    durationMs: Date.now() - started,
    parser: parsed.parser.type,
  });
  revalidatePath('/onboarding/resume');
  revalidatePath('/onboarding/profile');
  revalidatePath('/profile');
  return { status: 'parsed', resumeId: resume.id };
}

async function failParse(resumeId: string, userId: string, started: number, parser: string) {
  const supabase = await createClient();
  await supabase.from('resumes').update({ parse_status: 'failed' }).eq('id', resumeId).eq('user_id', userId);
  logResumeParse('resume_parse_failed', {
    resumeId,
    userId,
    durationMs: Date.now() - started,
    parser,
  });
}

async function persistParseResult(userId: string, resumeId: string, parsed: ParsedResumeV1) {
  const supabase = await createClient();
  await supabase
    .from('resumes')
    .update({ parse_status: 'succeeded', parsed_content: parsed })
    .eq('id', resumeId)
    .eq('user_id', userId);

  const { count } = await supabase
    .from('resume_skills')
    .select('id', { count: 'exact', head: true })
    .eq('resume_id', resumeId)
    .eq('extraction_source', 'user');

  // Manual edits beat parser suggestions. Re-parse refreshes parsed_content
  // but must not recreate skills the user already confirmed or removed.
  if ((count ?? 0) > 0) return;

  await supabase.from('resume_skills').delete().eq('resume_id', resumeId).eq('extraction_source', 'parser');

  if (parsed.detectedSkills.length === 0) return;

  await supabase.from('resume_skills').upsert(
    parsed.detectedSkills.map((skill) => ({
      user_id: userId,
      resume_id: resumeId,
      skill_id: skill.skillId,
      confidence: skill.confidence,
      extraction_source: 'parser',
    })),
    { onConflict: 'resume_id,skill_id', ignoreDuplicates: true },
  );
}

export async function saveProfileReviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await requireAuth('/onboarding/profile');
  const yearsRaw = String(formData.get('yearsExperience') ?? '').trim();
  const parsed = profileReviewSchema.safeParse({
    fullName: formData.get('fullName'),
    headline: formData.get('headline'),
    yearsExperience: yearsRaw === '' ? null : Number(yearsRaw),
    city: String(formData.get('city') ?? ''),
    country: String(formData.get('country') ?? ''),
    skillIds: jsonList(formData.get('skillIds')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your profile details.' };
  }

  const supabase = await createClient();
  const { data: resume } = await supabase
    .from('resumes')
    .select('id')
    .eq('user_id', identity.userId)
    .eq('is_default', true)
    .eq('parse_status', 'succeeded')
    .maybeSingle();
  if (!resume) return { error: 'Upload and review a resume first.' };

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      headline: parsed.data.headline,
      years_experience: parsed.data.yearsExperience,
      city: parsed.data.city || null,
      country: parsed.data.country || null,
    })
    .eq('id', identity.userId);
  if (profileError) return { error: 'We could not save your profile.' };

  await supabase.from('resume_skills').delete().eq('resume_id', resume.id).eq('user_id', identity.userId);
  if (parsed.data.skillIds.length > 0) {
    const { error: skillError } = await supabase.from('resume_skills').insert(
      parsed.data.skillIds.map((skillId) => ({
        user_id: identity.userId,
        resume_id: resume.id,
        skill_id: skillId,
        confidence: 1,
        extraction_source: 'user',
      })),
    );
    if (skillError) return { error: 'We could not save your skills.' };
  }

  revalidatePath('/onboarding/profile');
  revalidatePath('/onboarding/preferences');
  revalidatePath('/profile');
  revalidatePath('/home');

  const next = formData.get('next') === 'profile' ? '/profile' : '/onboarding/preferences';
  redirect(next);
}

export async function savePreferencesAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await requireAuth('/onboarding/preferences');
  const parsed = parsePreferencesFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your preferences.' };
  }

  const complete = formData.get('complete') === 'true';
  if (complete && parsed.data.targetRoles.length === 0 && parsed.data.workModes.length === 0) {
    return { error: 'Add a target role or choose a work style to continue.' };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('headline, full_name')
    .eq('id', identity.userId)
    .maybeSingle();
  if (!profile?.headline || !profile.full_name) {
    return { error: 'Finish reviewing your profile first.' };
  }

  const { error } = await supabase.from('job_preferences').upsert(
    {
      user_id: identity.userId,
      target_roles: parsed.data.targetRoles,
      preferred_locations: parsed.data.preferredLocations,
      work_modes: parsed.data.workModes,
      employment_types: parsed.data.employmentTypes,
      minimum_salary: parsed.data.minimumSalary,
      currency: parsed.data.currency,
      minimum_match_score: parsed.data.minimumMatchScore,
      excluded_keywords: parsed.data.excludedKeywords,
    },
    { onConflict: 'user_id' },
  );
  if (error) return { error: 'We could not save your preferences.' };

  if (complete) {
    const { error: completeError } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', identity.userId);
    if (completeError) return { error: 'We could not finish onboarding.' };
  }

  revalidatePath('/home');
  revalidatePath('/profile');
  redirect(complete ? '/home' : '/profile');
}

export async function createResumeSignedUrlAction(): Promise<{ error?: string; url?: string }> {
  const identity = await requireAuth('/profile');
  const supabase = await createClient();
  const { data: resume } = await supabase
    .from('resumes')
    .select('storage_path')
    .eq('user_id', identity.userId)
    .eq('is_default', true)
    .maybeSingle();
  if (!resume) return { error: 'No resume to download.' };
  const { data, error } = await supabase.storage.from('resumes').createSignedUrl(resume.storage_path, 60);
  if (error || !data?.signedUrl) return { error: 'Could not create a private download link.' };
  return { url: data.signedUrl };
}

function jsonList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}
