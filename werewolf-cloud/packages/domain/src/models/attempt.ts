import { z } from 'zod';

export const attemptStatusSchema = z.enum(['Pending', 'Successful', 'Failed']);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

export const liftTypeSchema = z.enum(['Squat', 'Bench', 'Deadlift']);
export type LiftType = z.infer<typeof liftTypeSchema>;

export const attemptNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AttemptNumber = z.infer<typeof attemptNumberSchema>;

export const attemptSchema = z.object({
  id: z.string().uuid(),
  registrationId: z.string().uuid(),
  liftType: liftTypeSchema,
  attemptNumber: attemptNumberSchema,
  weight: z.number().nonnegative(),
  status: attemptStatusSchema,
  timestamp: z.string().datetime().nullable().optional(),
  judge1Decision: z.boolean().nullable().optional(),
  judge2Decision: z.boolean().nullable().optional(),
  judge3Decision: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Attempt = z.infer<typeof attemptSchema>;

export const attemptUpsertSchema = attemptSchema.pick({
  registrationId: true,
  liftType: true,
  attemptNumber: true,
  weight: true,
});
export type AttemptUpsertInput = z.infer<typeof attemptUpsertSchema>;

export const attemptResultUpdateSchema = z.object({
  status: attemptStatusSchema,
  judge1Decision: z.boolean().nullable().optional(),
  judge2Decision: z.boolean().nullable().optional(),
  judge3Decision: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AttemptResultUpdate = z.infer<typeof attemptResultUpdateSchema>;
