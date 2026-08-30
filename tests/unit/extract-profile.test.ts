import { describe, expect, it } from 'vitest';
import { extractProfileSuggestions } from '@/lib/resume/extract-profile';

describe('profile extraction', () => {
  it('reads a recognizable title and stated years', () => {
    const text = ['Alex Candidate', 'Senior Software Engineer', '8 years of experience'].join('\n');
    const result = extractProfileSuggestions(text);
    expect(result.headline).toBe('Senior Software Engineer');
    expect(result.yearsExperience).toBe(8);
    expect(result.city).toBeNull();
    expect(result.country).toBeNull();
  });

  it('returns no title when none is present', () => {
    const result = extractProfileSuggestions('Alex Candidate\nBuilt things.\nVolunteer work.');
    expect(result.headline).toBeNull();
  });

  it('does not invent years from unrelated numbers', () => {
    const result = extractProfileSuggestions('Alex Candidate\nFrontend Engineer\nShipped 8 products in Q4.');
    expect(result.headline).toBe('Frontend Engineer');
    expect(result.yearsExperience).toBeNull();
  });

  it('handles empty content conservatively', () => {
    const result = extractProfileSuggestions('');
    expect(result).toEqual({
      headline: null,
      yearsExperience: null,
      city: null,
      country: null,
    });
  });
});
