import { describe, expect, it } from 'vitest';
import { jobPreferencesSchema, parsePreferencesFormData } from '@/lib/validation/preferences';
import { commitChipDraft } from '@/lib/validation/chips';

describe('jobPreferencesSchema', () => {
  it('accepts a fully populated object', () => {
    const parsed = jobPreferencesSchema.parse({
      targetRoles: ['Frontend Engineer'],
      preferredLocations: ['Remote', 'Bengaluru'],
      workModes: ['remote', 'hybrid'],
      employmentTypes: ['full_time', 'freelance'],
      minimumSalary: 100_000,
      currency: 'USD',
      minimumMatchScore: 80,
      excludedKeywords: ['unpaid'],
    });
    expect(parsed.minimumMatchScore).toBe(80);
  });

  it('applies defaults for missing fields', () => {
    const parsed = jobPreferencesSchema.parse({});
    expect(parsed.targetRoles).toEqual([]);
    expect(parsed.currency).toBe('USD');
    expect(parsed.minimumMatchScore).toBe(75);
    expect(parsed.minimumSalary).toBeNull();
  });

  it('rejects invalid work modes', () => {
    const result = jobPreferencesSchema.safeParse({ workModes: ['martian'] });
    expect(result.success).toBe(false);
  });

  it('clamps match-score range', () => {
    expect(jobPreferencesSchema.safeParse({ minimumMatchScore: 120 }).success).toBe(false);
    expect(jobPreferencesSchema.safeParse({ minimumMatchScore: -1 }).success).toBe(false);
  });
});

function preferencesFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set('targetRoles', '[]');
  formData.set('preferredLocations', '[]');
  formData.set('workModes', '[]');
  formData.set('employmentTypes', '[]');
  formData.set('excludedKeywords', '[]');
  formData.set('currency', 'USD');
  formData.set('minimumMatchScore', '75');
  formData.set('complete', 'true');
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe('parsePreferencesFormData', () => {
  it('persists Hyderabad when typed and submitted without Enter', () => {
    const parsed = parsePreferencesFormData(
      preferencesFormData({
        preferredLocations: '[]',
        preferredLocationDraft: 'Hyderabad',
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preferredLocations).toEqual(['Hyderabad']);
    }
  });

  it('normalizes and deduplicates unsaved drafts', () => {
    const parsed = parsePreferencesFormData(
      preferencesFormData({
        targetRoles: JSON.stringify(['Frontend Engineer']),
        targetRoleDraft: '  frontend engineer  ',
        excludedKeywords: '[]',
        excludedKeywordDraft: 'night shift',
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.targetRoles).toEqual(['Frontend Engineer']);
      expect(parsed.data.excludedKeywords).toEqual(['night shift']);
    }
  });

  it('does not exceed location or keyword limits', () => {
    const tenCities = Array.from({ length: 10 }, (_, index) => `City ${index + 1}`);
    const parsed = parsePreferencesFormData(
      preferencesFormData({
        preferredLocations: JSON.stringify(tenCities),
        preferredLocationDraft: 'Hyderabad',
        excludedKeywords: JSON.stringify(Array.from({ length: 20 }, (_, index) => `skip ${index}`)),
        excludedKeywordDraft: 'java-only',
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preferredLocations).toEqual(tenCities);
      expect(parsed.data.preferredLocations).not.toContain('Hyderabad');
      expect(parsed.data.excludedKeywords).toHaveLength(20);
      expect(parsed.data.excludedKeywords).not.toContain('java-only');
    }
  });
});

describe('commitChipDraft', () => {
  it('commits a location typed immediately before Start finding jobs', () => {
    expect(commitChipDraft([], 'Hyderabad', 10)).toEqual(['Hyderabad']);
  });
});
