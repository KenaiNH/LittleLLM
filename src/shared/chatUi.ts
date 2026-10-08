import { z } from 'zod';
export const draftSchema = z.object({ text: z.string().max(32000) }).strict();
export const submitSchema = z.object({ text: z.string().trim().min(1).max(32000) }).strict();
export const chatUiSchema = z
  .object({
    inputOpen: z.boolean(),
    draft: z.string().max(32000),
    echo: z
      .object({ name: z.string().max(64), text: z.string().max(32000) })
      .strict()
      .nullable(),
  })
  .strict();
export type ChatUi = z.infer<typeof chatUiSchema>;
