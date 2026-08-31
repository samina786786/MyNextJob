import { z } from 'zod';

/**
 * Ashby public Job Posting API objects. Extra fields are allowed so a
 * harmless API addition does not reject an otherwise valid posting.
 *
 * Official docs document the wrapper and most job fields. Live boards
 * also expose `jobs[].id` (UUID) even though the field table omits it.
 */

export const ashbyPostalAddressSchema = z
  .object({
    addressLocality: z.string().nullable().optional(),
    addressRegion: z.string().nullable().optional(),
    addressCountry: z.string().nullable().optional(),
  })
  .passthrough();

export const ashbyAddressSchema = z
  .object({
    postalAddress: ashbyPostalAddressSchema.nullable().optional(),
  })
  .passthrough();

export const ashbySecondaryLocationSchema = z
  .object({
    location: z.string().nullable().optional(),
    address: ashbyAddressSchema.nullable().optional(),
  })
  .passthrough();

export const ashbyCompensationComponentSchema = z
  .object({
    compensationType: z.string().nullable().optional(),
    interval: z.string().nullable().optional(),
    currencyCode: z.string().nullable().optional(),
    minValue: z.unknown().optional(),
    maxValue: z.unknown().optional(),
  })
  .passthrough();

export const ashbyCompensationTierSchema = z
  .object({
    id: z.unknown().optional(),
    title: z.string().nullable().optional(),
    additionalInformation: z.string().nullable().optional(),
    tierSummary: z.unknown().optional(),
    components: z.array(ashbyCompensationComponentSchema).optional(),
  })
  .passthrough();

export const ashbyCompensationSchema = z
  .object({
    compensationTierSummary: z.string().nullable().optional(),
    scrapeableCompensationSalarySummary: z.string().nullable().optional(),
    compensationTiers: z.array(ashbyCompensationTierSchema).optional(),
    summaryComponents: z.array(ashbyCompensationComponentSchema).optional(),
  })
  .passthrough();

export const ashbyJobSchema = z
  .object({
    id: z.unknown().optional(),
    title: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    secondaryLocations: z.array(ashbySecondaryLocationSchema).optional(),
    department: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    isRemote: z.boolean().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    descriptionHtml: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    employmentType: z.string().nullable().optional(),
    address: ashbyAddressSchema.nullable().optional(),
    jobUrl: z.string().nullable().optional(),
    applyUrl: z.string().nullable().optional(),
    isListed: z.boolean().nullable().optional(),
    compensation: ashbyCompensationSchema.nullable().optional(),
  })
  .passthrough();

export const ashbyBoardSchema = z
  .object({
    apiVersion: z.string(),
    jobs: z.array(z.unknown()),
  })
  .passthrough();

export type AshbyJob = z.infer<typeof ashbyJobSchema>;
export type AshbyCompensation = z.infer<typeof ashbyCompensationSchema>;
export type AshbyCompensationComponent = z.infer<typeof ashbyCompensationComponentSchema>;
export type AshbyBoard = z.infer<typeof ashbyBoardSchema>;
