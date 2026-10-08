import { z } from 'zod';
import { appErrorSchema } from './errors';
import { requestIdSchema } from './llm';
export const draftSchema = z.object({ text: z.string().max(32000) }).strict();
export const copyTextSchema = z.object({ text: z.string().max(512000) }).strict();
export const submitSchema = z.object({ text: z.string().trim().min(1).max(32000) }).strict();
export const chatUiSchema = z
  .object({
    inputOpen: z.boolean(),
    draft: z.string().max(32000),
    reply: z
      .object({
        requestId: requestIdSchema,
        name: z.string().max(64),
        text: z.string().max(512000),
        streaming: z.boolean(),
      })
      .strict()
      .nullable(),
    error: appErrorSchema.nullable(),
  })
  .strict();
export type ChatUi = z.infer<typeof chatUiSchema>;
