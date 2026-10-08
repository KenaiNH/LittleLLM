import { z } from 'zod';
export const attachmentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(200),
    thumbnail: z
      .string()
      .max(180000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export const attachmentsSchema = z.array(attachmentSchema).max(10);
export const chatImageSchema = z
  .object({
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    data: z
      .string()
      .max(14 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/=]+$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export const attachmentFileSchema = z
  .object({ paths: z.array(z.string().min(1).max(32767)).min(1).max(10).optional() })
  .strict();
export const attachmentRemoveSchema = z.object({ id: z.string().uuid() }).strict();
export const capabilitySchema = z
  .object({
    allowed: z.boolean(),
    supportsImages: z.boolean().nullable(),
    reason: z.string().max(500),
  })
  .strict();
export type Attachment = z.infer<typeof attachmentSchema>;
export type ChatImage = z.infer<typeof chatImageSchema>;
export type ImageCapability = z.infer<typeof capabilitySchema>;
