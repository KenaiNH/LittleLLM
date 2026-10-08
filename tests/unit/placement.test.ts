import { describe, it, expect } from 'vitest';
import { defaultPosition, clampPosition, snapPosition } from '../../src/main/windows/placement';
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
});
