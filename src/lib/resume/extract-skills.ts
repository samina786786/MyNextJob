import type { ResumeSkillMatch, SkillRecord } from './types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string): RegExp {
  const escaped = escapeRegExp(alias.trim());
  // Short tokens like `js` must not match the `.js` in `Node.js`.
  const lookbehind = alias.trim().length <= 3 ? '(?<![A-Za-z0-9.])' : '(?<![A-Za-z0-9])';
  return new RegExp(`${lookbehind}${escaped}(?![A-Za-z0-9])`, 'i');
}

/** Boundary-aware, case-insensitive match. `Java` does not match inside `JavaScript`. */
export function detectSkills(text: string, skills: SkillRecord[]): ResumeSkillMatch[] {
  const found = new Map<string, ResumeSkillMatch>();

  for (const skill of skills) {
    const aliases = [skill.name, ...skill.aliases]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .sort((a, b) => b.length - a.length);

    for (const alias of aliases) {
      if (aliasPattern(alias).test(text)) {
        found.set(skill.id, { skillId: skill.id, name: skill.name, confidence: 1 });
        break;
      }
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
