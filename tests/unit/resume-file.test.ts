import { describe, expect, it } from 'vitest';
import { inspectResumeSignature, validateResumeBytes, validateResumeMetadata } from '@/lib/resume/validate-file';
import { buildResumeStoragePath, displayFilename } from '@/lib/resume/storage-path';
import { PDF_MIME, DOCX_MIME } from '@/lib/resume/types';
import { MAX_RESUME_SIZE_BYTES } from '@/lib/validation/resume';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pdfFixture = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.pdf'));
const docxFixture = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.docx'));

describe('resume file signatures', () => {
  it('accepts a real PDF fixture', () => {
    expect(inspectResumeSignature(pdfFixture)).toBe(PDF_MIME);
    expect(validateResumeBytes(pdfFixture, PDF_MIME).ok).toBe(true);
  });

  it('accepts a real DOCX fixture', () => {
    expect(inspectResumeSignature(docxFixture)).toBe(DOCX_MIME);
    expect(validateResumeBytes(docxFixture, DOCX_MIME).ok).toBe(true);
  });

  it('rejects files over 10 MB', () => {
    const huge = Buffer.alloc(MAX_RESUME_SIZE_BYTES + 1, 0x25);
    huge.set(Buffer.from('%PDF'), 0);
    expect(validateResumeBytes(huge, PDF_MIME).ok).toBe(false);
    expect(validateResumeMetadata({ filename: 'huge.pdf', mimeType: PDF_MIME, size: huge.length }).ok).toBe(false);
  });

  it('rejects the wrong MIME at the metadata boundary', () => {
    expect(
      validateResumeMetadata({
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 100,
      }).ok,
    ).toBe(false);
  });

  it('rejects a spoofed PDF (ZIP bytes claimed as PDF)', () => {
    const result = validateResumeBytes(docxFixture, PDF_MIME);
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid DOCX (PDF bytes in a ZIP-less container)', () => {
    expect(inspectResumeSignature(pdfFixture)).not.toBe(DOCX_MIME);
    const fakeZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(inspectResumeSignature(fakeZip)).toBeNull();
  });
});

describe('storage path', () => {
  const userId = '5b47a1c2-1111-4111-8111-aaaaaaaaaaaa';
  const resumeId = '2bc41c18-2222-4222-8222-bbbbbbbbbbbb';

  it('uses generated identifiers, never the original filename', () => {
    expect(buildResumeStoragePath(userId, resumeId, PDF_MIME)).toBe(`${userId}/${resumeId}.pdf`);
    expect(buildResumeStoragePath(userId, resumeId, DOCX_MIME)).toBe(`${userId}/${resumeId}.docx`);
  });

  it('strips path characters from display names', () => {
    expect(displayFilename('..\\secret.pdf')).toBe('..secret.pdf');
    expect(displayFilename('folder/resume.docx')).toBe('folderresume.docx');
  });
});
