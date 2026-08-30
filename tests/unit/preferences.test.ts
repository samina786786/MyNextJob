import { describe, expect, it } from 'vitest';
import { jobPreferencesSchema } from '@/lib/validation/preferences';

describe('jobPreferencesSchema', () => {
  it('accepts a fully populated object', () => {
    const parsed = jobPreferencesSchema.parse({
      targetRoles: ['Frontend Engineer'],
      preferredLocations: ['Remote', 'Bengaluru'],
      workModes: ['remote', 'hybrid'],
      employmentTypes: ['full_time'],
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
    expect(parsed.minimumMatchScore).toBe(70);
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
