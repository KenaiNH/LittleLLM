import { z } from 'zod';
import { personaCardSchema } from './config';
export const personaFileSchema = personaCardSchema.extend({ schemaVersion: z.literal(1) }).strict();
export const personaActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create') }).strict(),
  z.object({ type: z.literal('duplicate'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('delete'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('select'), id: z.string().uuid().nullable() }).strict(),
  z
    .object({
      type: z.literal('patch-card'),
      id: z.string().uuid(),
      changes: personaCardSchema.partial().omit({ id: true, spritePackId: true }).strict(),
    })
    .strict(),
  z.object({ type: z.literal('fix-prompt') }).strict(),
]);
export const personaPreviewSchema = z
  .object({
    text: z.string().max(100000),
    examples: z
      .array(
        z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(500) }).strict(),
      )
      .max(16),
    estimatedTokens: z.number().nonnegative(),
    personaTokens: z.number().nonnegative(),
    unknownVariables: z.array(z.string().max(5000)).max(5000),
    tooLong: z.boolean(),
    warning: z.boolean(),
    historyBudget: z.number(),
  })
  .strict();
export type PersonaAction = z.infer<typeof personaActionSchema>;
export const personaStatusPreviewSchema = personaPreviewSchema.extend({
  promptNotice: z.string().max(1000).nullable(),
});
export type PersonaPreview = z.infer<typeof personaStatusPreviewSchema>;
