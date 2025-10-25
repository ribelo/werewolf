import { z } from 'zod';

export const contestTagSchema = z.object({
  id: z.string().min(1),
  contestId: z.string().uuid(),
  label: z.string().trim().min(1).max(64),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ContestTag = z.infer<typeof contestTagSchema>;

export const contestTagCreateSchema = contestTagSchema.pick({
  label: true,
}).extend({
  contestId: z.string().uuid().optional(),
});
export type ContestTagCreateInput = z.infer<typeof contestTagCreateSchema>;

export const contestTagUpdateSchema = contestTagCreateSchema.partial();
export type ContestTagUpdateInput = z.infer<typeof contestTagUpdateSchema>;
