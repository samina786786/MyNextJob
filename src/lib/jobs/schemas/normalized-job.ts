import { z } from 'zod';

import type { NormalizedJobInput } from '@/lib/jobs/types';

const remoteTypeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);

const employmentTypeSchema = z.enum([
  'full_time',
  'part_time',
  'contract',
  'freelance',
  'internship',
  'temporary',
  'unknown',
]);

const salaryPeriodSchema = z.enum(['hour', 'day', 'month', 'year', 'unknown']);

const salarySchema = z
  .object({
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
    currency: z.string().trim().max(8).nullable().optional(),
    period: salaryPeriodSchema.nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * Incoming adapter contract. Provider-specific field names are rejected
 * by construction — they are not on this schema.
 */
export const normalizedJobInputSchema = z.object({
  source: z.object({
    sourceId: z.string().uuid(),
    externalId: z.string().trim().min(1).max(500),
  }),
  company: z.object({
    companyId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(300),
    domain: z.string().trim().max(253).nullable().optional(),
    logoUrl: z.string().trim().max(2000).nullable().optional(),
  }),
  title: z.string().trim().min(1).max(400),
  location: z
    .object({
      text: z.string().trim().max(400).nullable().optional(),
      country: z.string().trim().max(120).nullable().optional(),
      city: z.string().trim().max(120).nullable().optional(),
      region: z.string().trim().max(120).nullable().optional(),
    })
    .default({}),
  remoteType: remoteTypeSchema.default('unknown'),
  employmentType: employmentTypeSchema.default('unknown'),
  descriptionHtml: z.string().max(200_000).nullable().optional(),
  descriptionText: z.string().max(200_000).nullable().optional(),
  experienceMin: z.number().int().min(0).max(80).nullable().optional(),
  experienceMax: z.number().int().min(0).max(80).nullable().optional(),
  salary: salarySchema,
  department: z.string().trim().max(200).nullable().optional(),
  team: z.string().trim().max(200).nullable().optional(),
  publishedAt: z.union([z.string(), z.date()]).nullable().optional(),
  applyUrl: z.string().trim().max(2000).default(''),
  sourceUrl: z.string().trim().max(2000).default(''),
  rawPayload: z.unknown().optional(),
});

export type ParsedNormalizedJobInput = z.infer<typeof normalizedJobInputSchema>;

export function parseNormalizedJobInput(input: unknown): NormalizedJobInput {
  return normalizedJobInputSchema.parse(input) as NormalizedJobInput;
}
