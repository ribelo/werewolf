import { z } from 'zod';
import { genderSchema } from './competitor';

export const equipmentFlagsSchema = z.object({
  equipmentM: z.boolean().default(false),
  equipmentSm: z.boolean().default(false),
  equipmentT: z.boolean().default(false),
});

export const registrationSchema = z.object({
  id: z.string().uuid(),
  contestId: z.string().uuid(),
  competitorId: z.string().uuid(),
  ageCategoryId: z.string().min(1).optional(),
  weightClassId: z.string().min(1).optional(),
  gender: genderSchema.optional(),
  bodyweight: z.number().positive(),
  lotNumber: z.string().nullable().optional(),
  personalRecordAtEntry: z.number().nullable().optional(),
  reshelCoefficient: z.number().nullable().optional(),
  mcculloughCoefficient: z.number().nullable().optional(),
  rackHeightSquat: z.number().int().nullable().optional(),
  rackHeightBench: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  ...equipmentFlagsSchema.shape,
});

export type Registration = z.infer<typeof registrationSchema>;

export const registrationCreateSchema = registrationSchema.pick({
  competitorId: true,
  bodyweight: true,
  lotNumber: true,
  personalRecordAtEntry: true,
  reshelCoefficient: true,
  mcculloughCoefficient: true,
  rackHeightSquat: true,
  rackHeightBench: true,
  equipmentM: true,
  equipmentSm: true,
  equipmentT: true,
}).extend({
  contestId: z.string().uuid().optional(),
});

export type RegistrationCreateInput = z.infer<typeof registrationCreateSchema>;

export const registrationUpdateSchema = registrationCreateSchema.partial();
export type RegistrationUpdateInput = z.infer<typeof registrationUpdateSchema>;
