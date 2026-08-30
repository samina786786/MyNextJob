const TITLE_HINTS = [
  'software engineer',
  'frontend engineer',
  'front-end engineer',
  'front end engineer',
  'backend engineer',
  'full stack',
  'fullstack',
  'react developer',
  'react native developer',
  'software developer',
  'web developer',
  'mobile engineer',
  'ios engineer',
  'android engineer',
  'product designer',
  'ux engineer',
];

const YEARS_PHRASE = /\b(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\s+(?:of\s+)?(?:experience|exp)\b/i;

export interface ProfileSuggestions {
  headline: string | null;
  yearsExperience: number | null;
  city: string | null;
  country: string | null;
}

export function extractProfileSuggestions(text: string): ProfileSuggestions {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const headline = inferHeadline(lines);
  return {
    headline,
    yearsExperience: inferYears(text),
    city: null,
    country: null,
  };
}

function inferHeadline(lines: string[]): string | null {
  for (const line of lines.slice(0, 12)) {
    const lower = line.toLowerCase();
    if (TITLE_HINTS.some((hint) => lower.includes(hint)) && line.length <= 120) {
      return line.replace(/\s+/g, ' ');
    }
  }
  return null;
}

function inferYears(text: string): number | null {
  const phrase = text.match(YEARS_PHRASE);
  if (phrase) {
    const years = Number(phrase[1]);
    if (Number.isInteger(years) && years >= 1 && years <= 50) return years;
  }

  // Date ranges alone are too easy to over-count overlapping jobs.
  return null;
}
