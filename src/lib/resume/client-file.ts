import { ALLOWED_RESUME_MIME_TYPES, MAX_RESUME_SIZE_BYTES } from '@/lib/validation/resume';
import { DOCX_MIME, PDF_MIME } from './types';

export function inferResumeMime(file: File): (typeof ALLOWED_RESUME_MIME_TYPES)[number] | string {
  if (file.type === PDF_MIME || file.type === DOCX_MIME) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return PDF_MIME;
  if (name.endsWith('.docx')) return DOCX_MIME;
  return file.type;
}

export function validateResumeFile(file: File):
  | { ok: true; mimeType: (typeof ALLOWED_RESUME_MIME_TYPES)[number] }
  | { ok: false; message: string } {
  if (!file || file.size <= 0) {
    return { ok: false, message: 'Choose a resume file to continue.' };
  }
  if (file.size > MAX_RESUME_SIZE_BYTES) {
    return { ok: false, message: 'Resumes must be 10 MB or smaller.' };
  }
  const mimeType = inferResumeMime(file);
  const allowed = ALLOWED_RESUME_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_RESUME_MIME_TYPES)[number],
  );
  const lower = file.name.toLowerCase();
  if (!allowed || (!lower.endsWith('.pdf') && !lower.endsWith('.docx'))) {
    return { ok: false, message: 'Upload a PDF or DOCX resume.' };
  }
  return { ok: true, mimeType: mimeType as (typeof ALLOWED_RESUME_MIME_TYPES)[number] };
}
