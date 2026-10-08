import { describe, it, expect } from 'vitest';
import { arrangePet, bubbleLimits, petViewportSchema } from '../../src/shared/petLayout';
import { defaults } from '../../src/shared/config';
const area = { x: 0, y: 0, width: 1280, height: 720 };
describe('bubble placement', () => {
  it('keeps the bottom-right sprite fixed and mirrors the tail', () => {
    const sprite = { x: 1128, y: 568, width: 128, height: 128 },
      layout = arrangePet(sprite, { width: 560, height: 180 }, area, 'auto', 12);
    expect(layout.placement).toBe('above');
    expect(layout.mirror).toBe(true);
    expect(layout.window.x + layout.sprite.x).toBe(sprite.x);
    expect(layout.window.y + layout.sprite.y).toBe(sprite.y);
    expect(layout.window.x + layout.window.width).toBeLessThanOrEqual(1280);
  });
  it('flips below when there is no space above', () => {
    const layout = arrangePet(
      { x: 300, y: 0, width: 128, height: 128 },
      { width: 560, height: 180 },
      area,
      'above',
      12,
    );
    expect(layout.placement).toBe('below');
    expect(layout.bubble?.y).toBe(140);
  });
  it.each(['left', 'right'] as const)('honors %s placement when it fits', (side) => {
    const layout = arrangePet(
      { x: 600, y: 250, width: 128, height: 128 },
      { width: 240, height: 180 },
      area,
      side,
      12,
    );
    expect(layout.placement).toBe(side);
  });
  it('handles a removed display and excessive dimensions', () => {
    const layout = arrangePet(
      { x: -1800, y: -100, width: 128, height: 128 },
      { width: 1800, height: 1000 },
      area,
      'auto',
      12,
    );
    expect(layout.window.x).toBe(0);
    expect(layout.window.y).toBe(0);
    expect(layout.window.width).toBeLessThanOrEqual(area.width);
    expect(layout.window.height).toBeLessThanOrEqual(area.height);
  });
  it.each([0.5, 1, 2.5])('scales and caps bubble limits at %s', (scale) => {
    const cfg = defaults();
    cfg.bubble.scale = scale;
    const limits = bubbleLimits(cfg, area, 1, 128);
    expect(limits.width).toBe(Math.min(area.width, 560 * scale));
    expect(limits.height).toBeLessThanOrEqual(area.height - 140);
    expect(limits.scale).toBe(scale);
  });
  it('uses work-area percentages in screen-relative mode', () => {
    const cfg = defaults();
    cfg.bubble.scaleRelativeTo = 'screen';
    const limits = bubbleLimits(cfg, area);
    expect(limits.width).toBe(320);
    expect(limits.height).toBe(288);
  });
  it.each(['auto', 'above', 'below', 'left', 'right'] as const)(
    'serializes %s placement through the strict IPC contract',
    (placement) => {
      const value = arrangePet(
        { x: 600, y: 300, width: 128, height: 128 },
        { width: 560, height: 232 },
        area,
        placement,
        12,
      );
      expect(petViewportSchema.parse({ ...value, dpi: 1.25, dark: false })).toMatchObject({
        placement: value.placement,
      });
    },
  );
});
