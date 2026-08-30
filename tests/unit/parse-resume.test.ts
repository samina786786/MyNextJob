/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/resume/parsers/pdf';
import { extractDocxText } from '@/lib/resume/parsers/docx';
import { parseResumeBuffer } from '@/lib/resume/parse-resume';
import { SKILL_CATALOG } from '@/lib/skills/catalog';
import { DOCX_MIME, PDF_MIME } from '@/lib/resume/types';

const skills = SKILL_CATALOG.map((skill, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: skill.name,
  aliases: [...skill.aliases],
}));

describe('local resume parsers', () => {
  it('extracts text from the sample PDF', async () => {
    const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.pdf'));
    const result = await extractPdfText(bytes);
    expect('text' in result).toBe(true);
    if ('text' in result) {
      expect(result.text).toContain('Alex Candidate');
      expect(result.text).toContain('Senior Software Engineer');
    }
  });

  it('extracts raw text from the sample DOCX', async () => {
    const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.docx'));
    const result = await extractDocxText(bytes);
    expect('text' in result).toBe(true);
    if ('text' in result) {
      expect(result.text).toContain('Alex Candidate');
    }
  });

  it('parses the PDF into versioned suggestions without a third-party API', async () => {
    const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.pdf'));
    const parsed = await parseResumeBuffer(bytes, PDF_MIME, skills);
    expect('version' in parsed).toBe(true);
    if ('version' in parsed) {
      expect(parsed.version).toBe(1);
      expect(parsed.parser.library).toBe('unpdf');
      expect(parsed.suggestions.headline).toBe('Senior Software Engineer');
      expect(parsed.detectedSkills.map((skill) => skill.name)).toEqual(
        expect.arrayContaining(['React', 'TypeScript', 'Node.js']),
      );
    }
  });

  it('parses the DOCX with mammoth raw text', async () => {
    const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/resume-sample.docx'));
    const parsed = await parseResumeBuffer(bytes, DOCX_MIME, skills);
    expect('version' in parsed).toBe(true);
    if ('version' in parsed) {
      expect(parsed.parser.library).toBe('mammoth');
    }
  });
});
