import { z } from 'zod';

/**
 * Schema shared by any code path that reads or writes user job preferences.
 * Validation must happen at every trust boundary (form submits, route
 * handlers, edge functions) — never trust `res.json()` blindly.
 */
export const jobPreferencesSchema = z.object({
  targetRoles: z.array(z.string().trim().min(1)).max(20).default([]),
  preferredLocations: z.array(z.string().trim().min(1)).max(20).default([]),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onsite', 'any'])).max(4).default([]),
  employmentTypes: z
    .array(z.enum(['full_time', 'part_time', 'contract', 'internship', 'temporary']))
    .max(5)
    .default([]),
  minimumSalary: z.number().int().min(0).max(10_000_000).nullable().default(null),
  currency: z.string().length(3).default('USD'),
  minimumMatchScore: z.number().int().min(0).max(100).default(70),
  excludedKeywords: z.array(z.string().trim().min(1)).max(50).default([]),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;
