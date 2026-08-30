import { z } from 'zod';

/**
 * Greenhouse Job Board API payloads. Extra fields are allowed so a
 * harmless API addition does not reject an otherwise valid job.
 */

export const greenhouseNamedEntitySchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().nullable().optional(),
  })
  .passthrough();

export const greenhouseLocationSchema = z
  .object({
    name: z.string().nullable().optional(),
  })
  .passthrough();

export const greenhouseJobSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    internal_job_id: z.union([z.number(), z.string()]).nullable().optional(),
    title: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    requisition_id: z.union([z.string(), z.number()]).nullable().optional(),
    location: greenhouseLocationSchema.nullable().optional(),
    absolute_url: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    metadata: z.unknown().optional(),
    content: z.string().nullable().optional(),
    departments: z.array(greenhouseNamedEntitySchema).optional(),
    offices: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const greenhouseJobsListSchema = z
  .object({
    jobs: z.array(z.unknown()),
    meta: z
      .object({
        total: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const greenhouseBoardSchema = z
  .object({
    name: z.string().nullable().optional(),
  })
  .passthrough();

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type GreenhouseJobsList = z.infer<typeof greenhouseJobsListSchema>;
export type GreenhouseBoard = z.infer<typeof greenhouseBoardSchema>;
