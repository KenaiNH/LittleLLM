import { z } from 'zod';
import { spriteSchema, spriteStateSchema, mouthSchema, personaCardSchema } from './config';
export const spriteTargetSchema = z.enum(['idle', 'thinking', 'speaking', 'listening', 'mouth']);
export type SpriteTarget = z.infer<typeof spriteTargetSchema>;
export const spriteModeSchema = spriteStateSchema.shape.mode.removeDefault();
export const spriteImportRequestSchema = z
  .object({
    state: spriteTargetSchema,
    mode: spriteModeSchema,
    paths: z.array(z.string().min(1).max(32767)).min(1).max(512).optional(),
  })
  .strict();
export const spriteResetRequestSchema = z.object({ state: spriteTargetSchema }).strict();
export const spritePackSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(128).default('Sprite Pack'),
    sprite: spriteSchema,
    persona: personaCardSchema.optional(),
  })
  .strict();
export type SpritePack = z.infer<typeof spritePackSchema>;
export const spritePatchSchema = z
  .object({ state: spriteTargetSchema, value: z.record(z.unknown()) })
  .strict();
export const mouthAsState = (mouth: z.infer<typeof mouthSchema>) =>
  spriteStateSchema.parse({
    mode: mouth.mode,
    source: mouth.source,
    frameWidth: mouth.frameWidth,
    frameHeight: mouth.frameHeight,
    frameCount: mouth.frameCount,
    fps: 12,
  });
export function applySpriteFields(
  current: object,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split('.');
    if (parts.length === 1) next[key] = value;
    else if (
      parts.length === 2 &&
      (parts[0] === 'anchor' || parts[0] === 'offset') &&
      (parts[1] === 'x' || parts[1] === 'y')
    ) {
      const parent = parts[0],
        child = parts[1];
      next[parent] = { ...(next[parent] as Record<string, unknown>), [child]: value };
    } else throw new Error('Unsupported sprite field');
  }
  return next;
}
