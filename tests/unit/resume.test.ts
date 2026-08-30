import { describe, expect, it } from 'vitest';
import {
  ALLOWED_RESUME_MIME_TYPES,
  MAX_RESUME_SIZE_BYTES,
  resumeUploadSchema,
} from '@/lib/validation/resume';

describe('resumeUploadSchema', () => {
  it('accepts PDF and DOCX within the 10 MB cap', () => {
    expect(
      resumeUploadSchema.parse({
        filename: 'kiran.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      }).mimeType,
    ).toBe('application/pdf');

    expect(
      resumeUploadSchema.parse({
        filename: 'kiran.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: MAX_RESUME_SIZE_BYTES,
      }).filename,
    ).toBe('kiran.docx');
  });

  it('rejects legacy .doc and .txt MIME types', () => {
    expect(
      resumeUploadSchema.safeParse({
        filename: 'old.doc',
        mimeType: 'application/msword',
        size: 1024,
      }).success,
    ).toBe(false);

    expect(
      resumeUploadSchema.safeParse({
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 1024,
      }).success,
    ).toBe(false);
  });

  it('rejects files over 10 MB', () => {
    expect(
      resumeUploadSchema.safeParse({
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        size: MAX_RESUME_SIZE_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('V1 allow-list is PDF and DOCX only', () => {
    expect(ALLOWED_RESUME_MIME_TYPES).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });
});
