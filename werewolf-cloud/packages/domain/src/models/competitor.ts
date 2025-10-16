import { z } from 'zod';

export const genderSchema = z.enum(['Male', 'Female']);
export type Gender = z.infer<typeof genderSchema>;

export const competitorSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/\d{4}-\d{2}-\d{2}/, 'birthDate must be YYYY-MM-DD'),
  gender: genderSchema,
  club: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  photoData: z.instanceof(ArrayBuffer).nullable().optional(),
  photoFormat: z.string().nullable().optional(),
  photoMetadata: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Competitor = z.infer<typeof competitorSchema>;

export const competitorCreateSchema = competitorSchema.pick({
  firstName: true,
  lastName: true,
  birthDate: true,
  gender: true,
  club: true,
  city: true,
  notes: true,
});

export type CompetitorCreateInput = z.infer<typeof competitorCreateSchema>;

export const competitorUpdateSchema = competitorCreateSchema.partial();

export type CompetitorUpdateInput = z.infer<typeof competitorUpdateSchema>;
