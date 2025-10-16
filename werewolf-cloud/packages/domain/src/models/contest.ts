import { z } from 'zod';

export const contestStatusSchema = z.enum(['Setup', 'InProgress', 'Paused', 'Completed']);
export type ContestStatus = z.infer<typeof contestStatusSchema>;

export const disciplineSchema = z.enum(['Bench', 'Squat', 'Deadlift', 'Powerlifting']);
export type Discipline = z.infer<typeof disciplineSchema>;

export const contestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/, 'date must be YYYY-MM-DD'),
  location: z.string().min(1),
  discipline: disciplineSchema,
  status: contestStatusSchema.default('Setup'),
  federationRules: z.string().nullable().optional(),
  competitionType: z.string().nullable().optional(),
  organizer: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isArchived: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  mensBarWeight: z.number().nonnegative().default(20),
  womensBarWeight: z.number().nonnegative().default(20),
  barWeight: z.number().nonnegative().default(20),
  clampWeight: z.number().nonnegative().default(2.5),
  activeFlight: z.string().min(1).nullable().optional(),
});
export type Contest = z.infer<typeof contestSchema>;

export const contestCreateSchema = contestSchema.pick({
  name: true,
  date: true,
  location: true,
  discipline: true,
  federationRules: true,
  competitionType: true,
  organizer: true,
  notes: true,
});
export type ContestCreateInput = z.infer<typeof contestCreateSchema>;

export const contestUpdateSchema = contestCreateSchema.partial().extend({
  status: contestStatusSchema.optional(),
  isArchived: z.boolean().optional(),
  mensBarWeight: z.number().positive().optional(),
  womensBarWeight: z.number().positive().optional(),
  clampWeight: z.number().positive().optional(),
  activeFlight: z.string().min(1).nullable().optional(),
});
export type ContestUpdateInput = z.infer<typeof contestUpdateSchema>;
