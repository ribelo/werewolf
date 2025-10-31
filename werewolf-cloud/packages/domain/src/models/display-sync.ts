import { z } from 'zod';
import { liftTypeSchema } from './attempt';

export const displayFilterStateSchema = z.object({
  lift: liftTypeSchema.nullable(),
  sortColumn: z.string().min(1),
  sortDirection: z.enum(['asc', 'desc']),
  weight: z.string().min(1),
  age: z.string().min(1),
  label: z.string().min(1),
});

export type DisplayFilterState = z.infer<typeof displayFilterStateSchema>;

export const displayFilterSyncSchema = z.object({
  id: z.string().min(1),
  filters: displayFilterStateSchema,
});

export type DisplayFilterSync = z.infer<typeof displayFilterSyncSchema>;
