import { z } from 'zod';

export const settingsSchema = z.object({
  id: z.literal(1),
  language: z.enum(['en', 'pl']).default('en'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  autoBackup: z.boolean().default(false),
  autoBackupInterval: z.number().int().positive().default(15),
  lastBackupAt: z.string().datetime().nullable().optional(),
  backupPath: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.pick({
  language: true,
  theme: true,
  autoBackup: true,
  autoBackupInterval: true,
  backupPath: true,
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
