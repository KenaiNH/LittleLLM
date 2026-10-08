import { z } from 'zod';
import { appErrorSchema } from './errors';
import { requestIdSchema } from './llm';
import { attachmentsSchema } from './attachments';
export const draftSchema = z.object({ text: z.string().max(32000) }).strict();
export const copyTextSchema = z.object({ text: z.string().max(512000) }).strict();
export const submitSchema = z.object({ text: z.string().trim().max(32000) }).strict();
export const chatUiSchema = z
  .object({
    inputOpen: z.boolean(),
    draft: z.string().max(32000),
    attachments: attachmentsSchema.default([]),
    reply: z
      .object({
        requestId: requestIdSchema,
        name: z.string().max(64),
        text: z.string().max(512000),
        streaming: z.boolean(),
        userText: z.string().max(32000).default(''),
        attachments: attachmentsSchema.default([]),
      })
      .strict()
      .nullable(),
    error: appErrorSchema.nullable(),
    speechNotice: z.string().max(300).nullable().default(null),
    speaking: z.boolean().default(false),
    queuedMessage: z.boolean().default(false),
  })
  .strict();
export type ChatUi = z.infer<typeof chatUiSchema>;
