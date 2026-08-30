import { z } from 'zod';

export const profileReviewSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(80),
  headline: z.string().trim().min(1, 'Add a professional headline.').max(120),
  yearsExperience: z.number().int().min(0).max(50).nullable(),
  city: z.string().trim().max(100),
  country: z.string().trim().max(100),
  skillIds: z.array(z.string().uuid()).max(100),
});

export type ProfileReviewInput = z.infer<typeof profileReviewSchema>;
