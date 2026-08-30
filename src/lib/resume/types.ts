export type ResumeParserKind = 'pdf' | 'docx';

export interface ResumeSkillMatch {
  skillId: string;
  name: string;
  confidence: number;
}

export interface ParsedResumeV1 {
  version: 1;
  parser: {
    type: ResumeParserKind;
    library: string;
    parsedAt: string;
  };
  text: string;
  sections: {
    summary: string | null;
    experience: string | null;
    skills: string | null;
    education: string | null;
  };
  suggestions: {
    headline: string | null;
    yearsExperience: number | null;
    city: string | null;
    country: string | null;
  };
  detectedSkills: ResumeSkillMatch[];
  warnings: string[];
}

export interface SkillRecord {
  id: string;
  name: string;
  aliases: string[];
}

export interface ParseFailure {
  code: 'empty' | 'scanned' | 'encrypted' | 'corrupt' | 'unsupported';
  message: string;
}

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
