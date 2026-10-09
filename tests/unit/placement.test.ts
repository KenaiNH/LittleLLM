import { describe, it, expect } from 'vitest';
import { defaultPosition, clampPosition, snapPosition } from '../../src/main/windows/placement';
import { capturePlacement, placedOrigin } from '../../src/main/windows/spritePlacement';
describe('desktop placement', () => {
  const area = { x: 1920, y: 0, width: 1920, height: 1040 };
  const size = { width: 128, height: 128 };
  it('starts bottom-right with specified margin', () =>
    expect(defaultPosition(size, area, 'br', 24)).toEqual({ x: 3688, y: 888 }));
  it('clamps after display removal', () =>
    expect(clampPosition({ x: -2000, y: 2000 }, size, area)).toEqual({ x: 1920, y: 912 }));
  it('handles negative-coordinate displays and oversized windows', () =>
    expect(
      clampPosition(
        { x: 100, y: 100 },
        { width: 3000, height: 2000 },
        { x: -1280, y: -200, width: 1280, height: 720 },
      ),
    ).toEqual({ x: -1280, y: -200 }));
  it('snaps at configured threshold', () =>
    expect(snapPosition({ x: 1929, y: 908 }, size, area, 16)).toEqual({ x: 1920, y: 912 }));
  it.each(['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br'])(
    'retains %s placement through larger, smaller and differently anchored artwork',
    (anchor) => {
      const original = { ...size, anchor: { x: 64, y: 128 } };
      const placement = capturePlacement(
        defaultPosition(size, area, anchor, 24),
        original,
        area,
        24,
        anchor,
      );
      for (const geometry of [
        { width: 300, height: 90, anchor: { x: 0, y: 45 } },
        { width: 40, height: 400, anchor: { x: 40, y: 0 } },
        original,
      ])
        expect(placedOrigin(placement, geometry, area)).toEqual(
          defaultPosition(geometry, area, anchor, 24),
        );
    },
  );
  it('restores edge attachments with zero or configured margin', () => {
    const geometry = { ...size, anchor: { x: 64, y: 128 } };
    for (const margin of [0, 24]) {
      const placement = capturePlacement(
        defaultPosition(size, area, 'br', margin),
        geometry,
        area,
        24,
      );
      const next = { width: 256, height: 64, anchor: { x: 0, y: 0 } };
      expect(placedOrigin(placement, next, area)).toEqual(
        defaultPosition(next, area, 'br', margin),
      );
    }
  });
  it('keeps a free anchor through temporary clipping and returns without accumulating drift', () => {
    const geometry = { ...size, anchor: { x: 64, y: 128 } };
    const origin = { x: 2200, y: 300 };
    const placement = capturePlacement(origin, geometry, area, 24);
    const large = { width: 1800, height: 900, anchor: { x: 900, y: 900 } };
    clampPosition(placedOrigin(placement, large, area), large, area);
    expect(placedOrigin(placement, geometry, area)).toEqual(origin);
  });
  it('recognizes a restored center after sizes change', () => {
    const geometry = { ...size, anchor: { x: 64, y: 128 } };
    const placement = capturePlacement(defaultPosition(size, area, 'c', 24), geometry, area, 24);
    const next = { width: 256, height: 64, anchor: { x: 0, y: 0 } };
    expect(placedOrigin(placement, next, area)).toEqual(defaultPosition(next, area, 'c', 24));
  });
});
