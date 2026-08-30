import { z } from 'zod';
import { commitChipDraft } from './chips';

/**
 * Schema shared by any code path that reads or writes user job preferences.
 * Validation must happen at every trust boundary (form submits, route
 * handlers, edge functions) — never trust `res.json()` blindly.
 */
export const jobPreferencesSchema = z.object({
  targetRoles: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  preferredLocations: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onsite', 'any'])).max(4).default([]),
  employmentTypes: z
    .array(z.enum(['full_time', 'part_time', 'contract', 'freelance', 'internship', 'temporary']))
    .max(5)
    .default([]),
  minimumSalary: z.number().int().min(0).max(10_000_000).nullable().default(null),
  currency: z.string().length(3).default('USD'),
  minimumMatchScore: z.number().int().min(0).max(100).default(75),
  excludedKeywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

function jsonList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function draftValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Parse the preferences form, including chip drafts that were typed but not
 * committed with Enter. Empty / duplicate / over-limit drafts are ignored.
 */
export function parsePreferencesFormData(formData: FormData) {
  return jobPreferencesSchema.safeParse({
    targetRoles: commitChipDraft(jsonList(formData.get('targetRoles')), draftValue(formData.get('targetRoleDraft')), 10, 80),
    preferredLocations: commitChipDraft(
      jsonList(formData.get('preferredLocations')),
      draftValue(formData.get('preferredLocationDraft')),
      10,
      80,
    ),
    workModes: jsonList(formData.get('workModes')),
    employmentTypes: jsonList(formData.get('employmentTypes')),
    minimumSalary: optionalNumber(formData.get('minimumSalary')),
    currency: String(formData.get('currency') || 'USD').toUpperCase(),
    minimumMatchScore: Number(formData.get('minimumMatchScore') || 75),
    excludedKeywords: commitChipDraft(
      jsonList(formData.get('excludedKeywords')),
      draftValue(formData.get('excludedKeywordDraft')),
      20,
      60,
    ),
  });
}
