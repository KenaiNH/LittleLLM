import { z } from 'zod';
import { requestIdSchema } from './llm';
const identity = { requestId: requestIdSchema, segment: z.number().int().min(0).max(1000) };
export const voiceListSchema = z
  .array(z.object({ id: z.string().max(200), name: z.string().max(200) }).strict())
  .max(1000);
export const ttsPacketSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      ...identity,
      format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'ogg', 'pcm16']),
    })
    .strict(),
  z
    .object({
      type: z.literal('data'),
      ...identity,
      data: z
        .string()
        .max(65536)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .strict(),
  z.object({ type: z.literal('end'), ...identity }).strict(),
  z.object({ type: z.literal('stop'), requestId: requestIdSchema }).strict(),
  z.object({ type: z.literal('finish'), ...identity }).strict(),
]);
export const ttsFeedbackSchema = z
  .object({
    ...identity,
    status: z.enum(['started', 'ended', 'error', 'warning']),
    message: z.string().max(300).optional(),
  })
  .strict();
export const ttsTestSchema = z
  .object({
    requestId: requestIdSchema,
    provider: z.string().max(64),
    baseUrl: z.string().max(2000),
    credentialRevision: z.string().max(100),
    firstAudioMs: z.number().nonnegative(),
  })
  .strict();
export type TTSPacket = z.infer<typeof ttsPacketSchema>;
export type TTSFeedback = z.infer<typeof ttsFeedbackSchema>;
