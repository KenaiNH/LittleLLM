import { z } from 'zod';
import type { Config } from './config';
export const sizeSchema = z
  .object({ width: z.number().positive().max(10000), height: z.number().positive().max(10000) })
  .strict();
export const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const rectSchema = pointSchema.merge(sizeSchema);
export const petLayoutRequestSchema = z
  .object({ sprite: sizeSchema, bubble: sizeSchema.nullable(), anchor: pointSchema.optional() })
  .strict()
  .refine(
    (value) =>
      !value.anchor ||
      (value.anchor.x >= 0 &&
        value.anchor.x <= value.sprite.width &&
        value.anchor.y >= 0 &&
        value.anchor.y <= value.sprite.height),
    'Anchor is outside the sprite',
  );
export const petViewportSchema = z
  .object({
    window: rectSchema,
    sprite: rectSchema,
    bubble: rectSchema.nullable(),
    workArea: rectSchema,
    placement: z.enum(['above', 'below', 'left', 'right']),
    mirror: z.boolean(),
    dpi: z.number().positive(),
    dark: z.boolean(),
  })
  .strict();
export type Rect = z.infer<typeof rectSchema>;
export type PetViewport = z.infer<typeof petViewportSchema>;
export function bubbleLimits(
  config: Config,
  area: { width: number; height: number },
  dpi = 1,
  spriteHeight = 0,
) {
  const cfg = config.bubble,
    scale =
      cfg.scale *
      (cfg.scaleRelativeTo === 'sprite'
        ? config.sprite.scale / (config.sprite.scaleMode === 'fixed' ? dpi : 1)
        : 1);
  return {
    scale,
    width: Math.min(
      area.width,
      cfg.scaleRelativeTo === 'screen'
        ? area.width * cfg.maxWidthPct * cfg.scale
        : Math.min(cfg.baseWidthPx, cfg.maxWidthPx) * scale,
    ),
    height: Math.min(
      Math.max(40, area.height - spriteHeight - cfg.gapFromSpritePx),
      cfg.scaleRelativeTo === 'screen'
        ? area.height * cfg.maxHeightPct * cfg.scale
        : cfg.maxHeightPx * scale,
    ),
  };
}
export function arrangePet(
  sprite: Rect,
  bubble: { width: number; height: number } | null,
  area: Rect,
  placement: Config['bubble']['bubblePlacement'],
  gap: number,
  anchorX = 0.5,
  tailInset = 70,
): Omit<PetViewport, 'dpi' | 'dark'> {
  const clamp = (r: Rect): Rect => ({
    ...r,
    x: Math.min(Math.max(r.x, area.x), area.x + area.width - r.width),
    y: Math.min(Math.max(r.y, area.y), area.y + area.height - r.height),
  });
  sprite = clamp({
    ...sprite,
    width: Math.min(sprite.width, area.width),
    height: Math.min(sprite.height, area.height),
  });
  if (!bubble)
    return {
      window: sprite,
      sprite: { x: 0, y: 0, width: sprite.width, height: sprite.height },
      bubble: null,
      workArea: area,
      placement: 'above',
      mirror: true,
    };
  const width = Math.min(bubble.width, area.width),
    height = Math.min(bubble.height, area.height),
    anchor = sprite.x + sprite.width * anchorX;
  type Candidate = Rect & { placement: 'above' | 'below' | 'left' | 'right'; mirror: boolean };
  const candidates: Candidate[] = [];
  const order: Candidate['placement'][] =
    placement === 'auto'
      ? ['above', 'below', 'left', 'right']
      : placement === 'above'
        ? ['above', 'below', 'left', 'right']
        : placement === 'below'
          ? ['below', 'above', 'left', 'right']
          : placement === 'left'
            ? ['left', 'right', 'above', 'below']
            : ['right', 'left', 'above', 'below'];
  for (const side of order) {
    if (side === 'above' || side === 'below') {
      const y = side === 'above' ? sprite.y - gap - height : sprite.y + sprite.height + gap;
      candidates.push(
        { x: anchor - tailInset, y, width, height, placement: side, mirror: false },
        { x: anchor - width + tailInset, y, width, height, placement: side, mirror: true },
      );
    } else {
      const x = side === 'left' ? sprite.x - gap - width : sprite.x + sprite.width + gap,
        y = sprite.y + sprite.height / 2;
      candidates.push(
        { x, y: y - tailInset, width, height, placement: side, mirror: side === 'left' },
        { x, y: y - height + tailInset, width, height, placement: side, mirror: side !== 'left' },
      );
    }
  }
  const overflow = (r: Rect) =>
    Math.max(0, area.x - r.x) +
    Math.max(0, area.y - r.y) +
    Math.max(0, r.x + r.width - area.x - area.width) +
    Math.max(0, r.y + r.height - area.y - area.height);
  const candidate =
    candidates.find((r) => overflow(r) === 0) ??
    [...candidates].sort((a, b) => overflow(a) - overflow(b))[0];
  if (!candidate) throw new Error('No layout candidates');
  const placed = clamp({
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    }),
    x = Math.floor(Math.min(sprite.x, placed.x)),
    y = Math.floor(Math.min(sprite.y, placed.y)),
    right = Math.ceil(Math.max(sprite.x + sprite.width, placed.x + placed.width)),
    bottom = Math.ceil(Math.max(sprite.y + sprite.height, placed.y + placed.height));
  return {
    window: { x, y, width: right - x, height: bottom - y },
    sprite: { ...sprite, x: sprite.x - x, y: sprite.y - y },
    bubble: { ...placed, x: placed.x - x, y: placed.y - y },
    workArea: area,
    placement: candidate.placement,
    mirror: candidate.mirror,
  };
}
