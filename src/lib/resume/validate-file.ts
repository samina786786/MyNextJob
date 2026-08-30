import { MAX_RESUME_SIZE_BYTES, resumeUploadSchema, type ResumeUploadInput } from '@/lib/validation/resume';
import { DOCX_MIME, PDF_MIME } from './types';

export interface FileValidationResult {
  ok: true;
  mimeType: ResumeUploadInput['mimeType'];
  size: number;
  filename: string;
}

export interface FileValidationFailure {
  ok: false;
  message: string;
}

const PDF_MAGIC = Buffer.from('%PDF');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function hasZipEntry(bytes: Buffer, name: string): boolean {
  return bytes.includes(Buffer.from(name));
}

/** Inspect magic bytes. Do not trust `file.type` or the extension alone. */
export function inspectResumeSignature(bytes: Uint8Array): typeof PDF_MIME | typeof DOCX_MIME | null {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    return PDF_MIME;
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    const looksLikeDocx =
      hasZipEntry(buffer, '[Content_Types].xml') &&
      (hasZipEntry(buffer, 'word/document.xml') || hasZipEntry(buffer, 'word/'));
    return looksLikeDocx ? DOCX_MIME : null;
  }
  return null;
}

export function validateResumeMetadata(input: {
  filename: string;
  mimeType: string;
  size: number;
}): FileValidationResult | FileValidationFailure {
  const parsed = resumeUploadSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? 'This file is not a supported resume.';
    return { ok: false, message: issue };
  }
  const lower = parsed.data.filename.toLowerCase();
  if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
    return { ok: false, message: 'Upload a PDF or DOCX resume.' };
  }
  return {
    ok: true,
    mimeType: parsed.data.mimeType,
    size: parsed.data.size,
    filename: parsed.data.filename,
  };
}

export function validateResumeBytes(bytes: Uint8Array, claimedMime: string): FileValidationResult | FileValidationFailure {
  if (bytes.byteLength === 0) {
    return { ok: false, message: "We couldn't read this file." };
  }
  if (bytes.byteLength > MAX_RESUME_SIZE_BYTES) {
    return { ok: false, message: 'Resumes must be 10 MB or smaller.' };
  }
  const detected = inspectResumeSignature(bytes);
  if (!detected) {
    return { ok: false, message: "We couldn't read this file." };
  }
  if (claimedMime && claimedMime !== detected) {
    return { ok: false, message: 'This file does not match a PDF or DOCX resume.' };
  }
  return {
    ok: true,
    mimeType: detected,
    size: bytes.byteLength,
    filename: detected === PDF_MIME ? 'resume.pdf' : 'resume.docx',
  };
}
