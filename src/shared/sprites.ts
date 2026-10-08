import { z } from 'zod';
import { SPRITE_STATES } from './enums';
export const spriteStateNameSchema=z.enum(SPRITE_STATES);
export const assetFrameSchema=z.object({url:z.string().startsWith('companion://sprites/'),delayMs:z.number().positive()}).strict();
export const spriteAssetSchema=z.object({width:z.number().int().positive(),height:z.number().int().positive(),frames:z.array(assetFrameSchema).min(1).max(512)}).strict();
export const spriteAssetsSchema=z.object({idle:spriteAssetSchema,thinking:spriteAssetSchema,speaking:spriteAssetSchema,listening:spriteAssetSchema.optional(),mouth:spriteAssetSchema.optional()}).strict();
export type SpriteAsset=z.infer<typeof spriteAssetSchema>;
export type SpriteAssets=z.infer<typeof spriteAssetsSchema>;
