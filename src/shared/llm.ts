import { z } from 'zod';
import { appErrorSchema } from './errors';

export const requestIdSchema = z.string().uuid();
export const usageSchema = z
  .object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();
export const chatDeltaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(512000) }).strict(),
  z.object({ type: z.literal('done'), usage: usageSchema.optional() }).strict(),
  z.object({ type: z.literal('error'), error: appErrorSchema }).strict(),
]);
export const chatEventSchema = z
  .object({ requestId: requestIdSchema, delta: chatDeltaSchema })
  .strict();
export const abortChatSchema = z.object({ requestId: requestIdSchema.optional() }).strict();
export const modelInfoSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().max(200),
    supportsImages: z.boolean().nullable(),
  })
  .strict();
export const connectionTestSchema = z
  .object({
    model: z.string(),
    latencyMs: z.number().nonnegative(),
    models: z.array(modelInfoSchema).max(10000),
    provider: z.string(),
    baseUrl: z.string(),
    credentialRevision: z.string().max(64),
  })
  .strict();
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
export type ChatDelta = z.infer<typeof chatDeltaSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ModelInfo = z.infer<typeof modelInfoSchema>;
