import { z } from 'zod';
import { genderSchema } from './competitor';

export const ageCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minAge: z.number().int().nonnegative().nullable().optional(),
  maxAge: z.number().int().positive().nullable().optional(),
});

export type AgeCategory = z.infer<typeof ageCategorySchema>;

export const weightClassSchema = z.object({
  id: z.string().min(1),
  gender: genderSchema,
  name: z.string().min(1),
  weightMin: z.number().nonnegative().nullable().optional(),
  weightMax: z.number().positive().nullable().optional(),
});

export type WeightClass = z.infer<typeof weightClassSchema>;
