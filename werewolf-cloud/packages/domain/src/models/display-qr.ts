import { z } from 'zod';

export const displayQrVisibilitySchema = z.object({
  target: z.enum(['table', 'current', 'all']),
  action: z.enum(['show', 'hide']),
});

export type DisplayQrVisibility = z.infer<typeof displayQrVisibilitySchema>;
