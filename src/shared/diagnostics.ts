import { z } from 'zod';
import { sessionStateSchema } from './config';
export const diagnosticActionSchema = z
  .object({
    action: z.enum([
      'open-logs',
      'open-config',
      'export-settings',
      'import-settings',
      'reset-all',
      'clear-keys',
      'clear-audio-cache',
      'devtools-pet',
      'devtools-settings',
    ]),
    confirmation: z.string().max(32).optional(),
  })
  .strict();
export const runtimeStatusSchema = z
  .object({
    onBattery: z.boolean(),
    warnings: z.array(z.string().max(500)).max(32),
    session: sessionStateSchema,
    audioCacheBytes: z.number().nonnegative(),
  })
  .strict();
export type DiagnosticAction = z.infer<typeof diagnosticActionSchema>;
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export const sessionPatchSchema = sessionStateSchema.partial().strict();
export type SessionPatch = z.infer<typeof sessionPatchSchema>;
