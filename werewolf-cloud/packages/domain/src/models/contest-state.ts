import { z } from 'zod';
import { attemptNumberSchema, liftTypeSchema } from './attempt';
import { contestStatusSchema } from './contest';

export const contestStateSchema = z.object({
  contestId: z.string().uuid(),
  status: contestStatusSchema,
  currentRound: z.number().int().min(1).default(1),
  currentLift: liftTypeSchema.nullable().optional(),
  currentAttemptNumber: attemptNumberSchema.nullable().optional(),
  updatedAt: z.string().datetime(),
});

export type ContestState = z.infer<typeof contestStateSchema>;

export const contestStateUpdateSchema = contestStateSchema.pick({
  status: true,
  currentRound: true,
  currentLift: true,
  currentAttemptNumber: true,
});

export type ContestStateUpdateInput = z.infer<typeof contestStateUpdateSchema>;
