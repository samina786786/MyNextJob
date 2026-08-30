import { describe, expect, it } from 'vitest';
import { detectSkills } from '@/lib/resume/extract-skills';
import { SKILL_CATALOG } from '@/lib/skills/catalog';
import type { SkillRecord } from '@/lib/resume/types';

function catalog(): SkillRecord[] {
  return SKILL_CATALOG.map((skill, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: skill.name,
    aliases: [...skill.aliases],
  }));
}

function names(text: string): string[] {
  return detectSkills(text, catalog()).map((skill) => skill.name);
}

describe('skill detection', () => {
  it('seeds a modest taxonomy', () => {
    expect(SKILL_CATALOG.length).toBeGreaterThanOrEqual(50);
    expect(SKILL_CATALOG.length).toBeLessThanOrEqual(100);
  });

  it('maps aliases to canonical names', () => {
    expect(names('Experience with React.js and ReactJS')).toContain('React');
    expect(names('NodeJS and Node.js services')).toContain('Node.js');
    expect(names('AWS and Amazon Web Services')).toContain('AWS');
  });

  it('does not detect Java inside JavaScript', () => {
    const found = names('Primary language: JavaScript');
    expect(found).toContain('JavaScript');
    expect(found).not.toContain('Java');
  });

  it('still detects Java when it appears independently', () => {
    const found = names('Java and JavaScript');
    expect(found).toEqual(expect.arrayContaining(['Java', 'JavaScript']));
  });

  it('keeps C++, C#, .NET, Node.js, and Next.js matchable', () => {
    const found = names('Stack: C++ C# .NET Node.js Next.js');
    expect(found).toEqual(expect.arrayContaining(['C++', 'C#', '.NET', 'Node.js', 'Next.js']));
  });
});
