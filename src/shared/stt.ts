import { z } from 'zod';
export const sttUiSchema = z
  .object({
    status: z
      .enum(['idle', 'starting', 'preview', 'recording', 'transcribing', 'countdown'])
      .default('idle'),
    sessionId: z.string().uuid().nullable().default(null),
    permission: z.enum(['unrequested', 'granted', 'denied', 'no-device']).default('unrequested'),
    level: z.number().min(0).max(1).default(0),
    microphoneOpen: z.boolean().default(false),
    partial: z.string().max(32000).default(''),
    notice: z.string().max(500).nullable().default(null),
    deadline: z.number().nonnegative().nullable().default(null),
  })
  .strict();
export type SttUi = z.infer<typeof sttUiSchema>;
export const sttActionSchema = z
  .object({ action: z.enum(['toggle', 'start', 'test-microphone']) })
  .strict();
export const sttPreviewSchema = z.object({ active: z.boolean() }).strict();
export const sttFrameSchema = z
  .object({
    sessionId: z.string().uuid(),
    index: z.number().int().min(0).max(20000),
    pcm: z
      .string()
      .max(856)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    level: z.number().min(0).max(1),
  })
  .strict();
export const sttFeedbackSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ready'),
      sessionId: z.string().uuid(),
      devices: z
        .array(z.object({ id: z.string().max(500), label: z.string().max(200) }).strict())
        .max(100),
    })
    .strict(),
  z.object({ type: z.literal('released'), sessionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('played'), sessionId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('level'),
      sessionId: z.string().uuid(),
      level: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      sessionId: z.string().uuid(),
      code: z.enum(['denied', 'no-device', 'device-lost', 'capture-error']),
    })
    .strict(),
]);
export const sttCaptureSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      sessionId: z.string().uuid(),
      preview: z.boolean(),
      deviceId: z.string().max(500),
      inputGain: z.number().min(0.5).max(4),
      noiseSuppression: z.enum(['default', 'aggressive', 'off']),
      echoCancellation: z.boolean(),
      maxSeconds: z.number().min(3).max(300),
      sounds: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('stop'), sessionId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('playback'),
      sessionId: z.string().uuid(),
      pcm: z.string().max(128000),
    })
    .strict(),
  z.object({ type: z.literal('heartbeat'), sessionId: z.string().uuid() }).strict(),
]);
export const sttDevicesSchema = z
  .array(z.object({ id: z.string().max(500), label: z.string().max(200) }).strict())
  .max(100);
export const sttTestSchema = z
  .object({ elapsedMs: z.number().nonnegative(), text: z.string().max(32000) })
  .strict();
export const caretSchema = z
  .object({ start: z.number().int().min(0).max(32000), end: z.number().int().min(0).max(32000) })
  .strict();
export type SttFrame = z.infer<typeof sttFrameSchema>;
export type SttCapture = z.infer<typeof sttCaptureSchema>;
export type SttFeedback = z.infer<typeof sttFeedbackSchema>;
