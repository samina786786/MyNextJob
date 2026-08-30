const HEADINGS: Record<string, keyof ReturnType<typeof emptySections>> = {
  summary: 'summary',
  profile: 'summary',
  objective: 'summary',
  about: 'summary',
  experience: 'experience',
  employment: 'experience',
  work: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  skills: 'skills',
  'technical skills': 'skills',
  technologies: 'skills',
  education: 'education',
  academic: 'education',
};

function emptySections() {
  return {
    summary: null as string | null,
    experience: null as string | null,
    skills: null as string | null,
    education: null as string | null,
  };
}

export function extractSections(text: string) {
  const sections = emptySections();
  const lines = text.split('\n');
  let current: keyof ReturnType<typeof emptySections> | null = 'summary';
  const buckets: Record<keyof ReturnType<typeof emptySections>, string[]> = {
    summary: [],
    experience: [],
    skills: [],
    education: [],
  };

  for (const line of lines) {
    const key = line.trim().toLowerCase().replace(/[:]+$/, '');
    const mapped = HEADINGS[key];
    if (mapped) {
      current = mapped;
      continue;
    }
    if (current) buckets[current].push(line);
  }

  for (const name of Object.keys(buckets) as (keyof typeof buckets)[]) {
    const value = buckets[name].join('\n').trim();
    sections[name] = value.length > 0 ? value : null;
  }
  return sections;
}
