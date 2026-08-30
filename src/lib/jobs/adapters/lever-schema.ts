import { z } from 'zod';

/**
 * Lever Postings API v0 job objects. Extra fields are allowed so a
 * harmless API addition does not reject an otherwise valid posting.
 */

export const leverCategoriesSchema = z
  .object({
    location: z.string().nullable().optional(),
    commitment: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    allLocations: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const leverListSchema = z
  .object({
    text: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
  })
  .passthrough();

export const leverSalaryRangeSchema = z
  .object({
    currency: z.string().nullable().optional(),
    interval: z.string().nullable().optional(),
    min: z.unknown().optional(),
    max: z.unknown().optional(),
  })
  .passthrough();

export const leverJobSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    text: z.string().nullable().optional(),
    categories: leverCategoriesSchema.nullable().optional(),
    country: z.string().nullable().optional(),
    opening: z.string().nullable().optional(),
    openingPlain: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    descriptionBody: z.string().nullable().optional(),
    descriptionBodyPlain: z.string().nullable().optional(),
    lists: z.array(leverListSchema).optional(),
    additional: z.string().nullable().optional(),
    additionalPlain: z.string().nullable().optional(),
    hostedUrl: z.string().nullable().optional(),
    applyUrl: z.string().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    salaryRange: leverSalaryRangeSchema.nullable().optional(),
    salaryDescription: z.string().nullable().optional(),
    salaryDescriptionPlain: z.string().nullable().optional(),
  })
  .passthrough();

export type LeverJob = z.infer<typeof leverJobSchema>;
export type LeverSalaryRange = z.infer<typeof leverSalaryRangeSchema>;
