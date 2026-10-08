import { z } from 'zod';
import { requestIdSchema } from './llm';
export const spriteStateSchema = z.enum(['idle', 'thinking', 'speaking', 'listening']);
export const companionStateSchema = z
  .object({
    state: spriteStateSchema,
    requestId: requestIdSchema.nullable(),
  })
  .strict();
export const overrideStateSchema = z
  .object({ state: z.enum(['auto', 'idle', 'thinking', 'speaking', 'listening']) })
  .strict();
export type CompanionState = z.infer<typeof companionStateSchema>;
