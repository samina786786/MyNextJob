import 'server-only';

import { extractSections } from './extract-sections';
import { extractProfileSuggestions } from './extract-profile';
import { detectSkills } from './extract-skills';
import { DOCX_MIME, PDF_MIME, type ParsedResumeV1, type ParseFailure, type SkillRecord } from './types';

export async function parseResumeBuffer(
  bytes: Uint8Array,
  mimeType: string,
  skills: SkillRecord[],
): Promise<ParsedResumeV1 | ParseFailure> {
  const extracted =
    mimeType === PDF_MIME
      ? await (await import('./parsers/pdf')).extractPdfText(bytes)
      : mimeType === DOCX_MIME
        ? await (await import('./parsers/docx')).extractDocxText(bytes)
        : null;

  if (!extracted) {
    return { code: 'unsupported', message: 'Upload a PDF or DOCX resume.' };
  }
  if ('code' in extracted) return extracted;

  const sections = extractSections(extracted.text);
  const suggestions = extractProfileSuggestions(extracted.text);
  const detectedSkills = detectSkills(extracted.text, skills);
  const warnings: string[] = [];
  if (detectedSkills.length === 0) {
    warnings.push('We could not match skills from our catalog. You can add them next.');
  }
  if (!suggestions.headline) {
    warnings.push('Add a professional headline so we know the roles you want.');
  }

  return {
    version: 1,
    parser: {
      type: mimeType === PDF_MIME ? 'pdf' : 'docx',
      library: mimeType === PDF_MIME ? 'unpdf' : 'mammoth',
      parsedAt: new Date().toISOString(),
    },
    text: extracted.text,
    sections,
    suggestions,
    detectedSkills,
    warnings,
  };
}

export function logResumeParse(
  event: 'resume_parse_started' | 'resume_parse_completed' | 'resume_parse_failed',
  details: { resumeId: string; userId: string; durationMs?: number; parser?: string },
): void {
  console.info(`[${event}]`, {
    resumeId: details.resumeId,
    userId: details.userId,
    durationMs: details.durationMs,
    parser: details.parser,
  });
}
