import { z } from 'zod';

/**
 * MIME types the `resumes` Supabase bucket accepts. Kept in sync with the
 * `allowed_mime_types` array on that bucket in
 * `supabase/migrations/0001_initial_schema.sql`.
 *
 * V1 supports PDF and DOCX only. `.doc` binaries and `.txt` were removed
 * on purpose — the resume parser (Phase 2) only needs to handle these.
 */
export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const resumeUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_RESUME_MIME_TYPES),
  size: z.number().int().positive().max(MAX_RESUME_SIZE_BYTES),
});

export type ResumeUploadInput = z.infer<typeof resumeUploadSchema>;
