import { z } from 'zod';
import { SPRITE_STATES } from './enums';
export const spriteStateNameSchema = z.enum(SPRITE_STATES);
export const assetFrameSchema = z
  .object({ url: z.string().startsWith('companion://sprites/'), delayMs: z.number().positive() })
  .strict();
export const spriteAssetSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frames: z.array(assetFrameSchema).min(1).max(512),
  })
  .strict();
export const spriteAssetsSchema = z
  .object({
    idle: spriteAssetSchema,
    thinking: spriteAssetSchema,
    speaking: spriteAssetSchema,
    listening: spriteAssetSchema.optional(),
    mouth: spriteAssetSchema.optional(),
  })
  .strict();
export type SpriteAsset = z.infer<typeof spriteAssetSchema>;
export type SpriteAssets = z.infer<typeof spriteAssetsSchema>;
export const alphaMaskSchema = z
  .object({
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    alphaBase64: z
      .string()
      .max(89478488)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
export const spriteMasksSchema = z.record(
  z.enum(['idle', 'thinking', 'speaking', 'listening', 'mouth']),
  alphaMaskSchema,
);
export type SpriteMasks = z.infer<typeof spriteMasksSchema>;
