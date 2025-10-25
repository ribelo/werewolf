import { z } from 'zod';

export const resultSchema = z.object({
  id: z.string().uuid(),
  registrationId: z.string().uuid(),
  contestId: z.string().uuid(),
  bestBench: z.number().nonnegative().default(0),
  bestSquat: z.number().nonnegative().default(0),
  bestDeadlift: z.number().nonnegative().default(0),
  totalWeight: z.number().nonnegative().default(0),
  coefficientPoints: z.number().nonnegative().default(0),
  squatPoints: z.number().nonnegative().default(0),
  benchPoints: z.number().nonnegative().default(0),
  deadliftPoints: z.number().nonnegative().default(0),
  placeOpen: z.number().int().positive().nullable().optional(),
  placeInAgeClass: z.number().int().positive().nullable().optional(),
  placeInWeightClass: z.number().int().positive().nullable().optional(),
  isDisqualified: z.boolean().default(false),
  disqualificationReason: z.string().nullable().optional(),
  brokeRecord: z.boolean().default(false),
  recordType: z.string().nullable().optional(),
  calculatedAt: z.string().datetime(),
});

export type Result = z.infer<typeof resultSchema>;
