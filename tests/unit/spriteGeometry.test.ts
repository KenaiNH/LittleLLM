import { expect, it } from 'vitest';
import { frameGeometry, unionGeometry, anchoredOrigin } from '../../src/shared/spriteGeometry';
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
