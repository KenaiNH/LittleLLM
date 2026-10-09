import { expect, it } from 'vitest';
import {
  frameGeometry,
  unionGeometry,
  anchoredOrigin,
  geometryFitScale,
  scaleGeometry,
} from '../../src/shared/spriteGeometry';
it('fits a legal 8192 px sprite at 400% without stretching anchors or exceeding textures/IPC', () => {
  const geometry = frameGeometry(8192, 4096, 4, { x: 0.25, y: 1 }, true);
  for (const dpi of [1, 1.25, 1.5, 1.75, 2, 3]) {
    const fitted = scaleGeometry(
      geometry,
      geometryFitScale(geometry, { width: 1920, height: 1080 }, dpi),
    );
    expect(fitted.width / fitted.height).toBe(2);
    expect(fitted.anchor.x / fitted.width).toBe(0.75);
    expect(fitted.anchor.y).toBe(fitted.height);
    expect(fitted.width).toBeLessThanOrEqual(1920);
    expect(fitted.height).toBeLessThanOrEqual(1080);
    expect(fitted.width * dpi).toBeLessThanOrEqual(4096);
  }
});
it('aligns different frame sizes and custom flipped anchors without shifting the world anchor', () => {
  const old = frameGeometry(128, 96, 1.5, { x: 0.25, y: 1 }, false);
  const next = frameGeometry(64, 256, 0.5, { x: 0.25, y: 0.5 }, true);
  const union = unionGeometry(old, next),
    start = { x: 500, y: 200 };
  expect(union).toEqual({ width: 192, height: 208, anchor: { x: 48, y: 144 } });
  const during = anchoredOrigin(start, old, union),
    end = anchoredOrigin(during, union, next);
  expect({ x: end.x + next.anchor.x, y: end.y + next.anchor.y }).toEqual({
    x: start.x + old.anchor.x,
    y: start.y + old.anchor.y,
  });
  expect(anchoredOrigin(end, next, old)).toEqual(start);
});
