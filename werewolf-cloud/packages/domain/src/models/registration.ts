import { z } from 'zod';
import { genderSchema } from './competitor';
import { liftTypeSchema } from './attempt';

const flightCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]$/)
  .transform((value) => value.toUpperCase());

export const registrationSchema = z.object({
  id: z.string().uuid(),
  contestId: z.string().uuid(),
  competitorId: z.string().uuid(),
  ageCategoryId: z.string().min(1).optional(),
  weightClassId: z.string().min(1).optional(),
  gender: genderSchema.optional(),
  bodyweight: z.number().positive(),
  reshelCoefficient: z.number().nullable().optional(),
  mcculloughCoefficient: z.number().nullable().optional(),
  rackHeightSquat: z.number().int().nullable().optional(),
  rackHeightBench: z.number().int().nullable().optional(),
  flightCode: flightCodeSchema.optional().nullable(),
  flightOrder: z.number().int().optional().nullable(),
  labels: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  lifts: z.array(liftTypeSchema).min(1),
});

export type Registration = z.infer<typeof registrationSchema>;

export const registrationCreateSchema = registrationSchema.pick({
  competitorId: true,
  bodyweight: true,
  reshelCoefficient: true,
  mcculloughCoefficient: true,
  rackHeightSquat: true,
  rackHeightBench: true,
  ageCategoryId: true,
  weightClassId: true,
  flightCode: true,
  flightOrder: true,
  labels: true,
}).extend({
  contestId: z.string().uuid().optional(),
  lifts: registrationSchema.shape.lifts.optional(),
});

export type RegistrationCreateInput = z.infer<typeof registrationCreateSchema>;

export const registrationUpdateSchema = registrationCreateSchema.partial();
export type RegistrationUpdateInput = z.infer<typeof registrationUpdateSchema>;
