import { it, expect } from 'vitest';
import { alphaHit, sourcePixel, unionAlpha } from '../../src/shared/hitTest';
it('maps DIP through device space at fractional scales with horizontal flip', () => {
  for (const dpi of [1, 1.25, 1.5, 1.75])
    for (const scaleMode of ['fixed', 'dpi-aware'] as const) {
      const cssScale = 1.35 / (scaleMode === 'fixed' ? dpi : 1);
      const point = sourcePixel({
        cursorDip: { x: -1280 + 10 + 1.1 * cssScale, y: 20 + 5 + 0.2 * cssScale },
        windowDip: { x: -1280, y: 20 },
        canvasCss: { x: 10, y: 5 },
        scale: 1.35,
        dpi,
        scaleMode,
        flip: true,
        width: 4,
        height: 2,
      });
      expect(point).toEqual({ x: 2, y: 0 });
      expect(
        alphaHit(
          { width: 4, height: 2, alpha: Uint8Array.from([0, 0, 255, 0, 0, 0, 0, 0]) },
          point,
          10,
        ),
      ).toBe(true);
    }
});
it('does not wrap points outside the sprite', () =>
  expect(
    sourcePixel({
      cursorDip: { x: -1, y: 0 },
      windowDip: { x: 0, y: 0 },
      canvasCss: { x: 0, y: 0 },
      scale: 1,
      dpi: 1,
      scaleMode: 'dpi-aware',
      flip: true,
      width: 4,
      height: 2,
    }),
  ).toBeNull());
it('unions alpha so later animation frames remain clickable', () =>
  expect([
    ...unionAlpha(
      [Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 200]), Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 0])],
      2,
      1,
    ),
  ]).toEqual([255, 200]));
