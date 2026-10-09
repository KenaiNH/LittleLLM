import type { SpriteGeometry } from '../../shared/spriteGeometry';
import type { Rect } from './placement';

type Axis = { edge: 'start' | 'end' | 'center'; inset: number } | null;
export type SpritePlacement = { x: Axis; y: Axis; anchor: { x: number; y: number } };

export function capturePlacement(
  origin: { x: number; y: number },
  geometry: SpriteGeometry,
  area: Rect,
  margin: number,
  defaultAnchor?: string,
): SpritePlacement {
  const axis = (position: number, size: number, start: number, span: number): Axis => {
    for (const inset of [0, margin]) {
      if (Math.abs(position - start - inset) <= 1) return { edge: 'start', inset };
      if (Math.abs(position + size - start - span + inset) <= 1) return { edge: 'end', inset };
    }
    if (Math.abs(position - start - (span - size) / 2) <= 0.5) return { edge: 'center', inset: 0 };
    return null;
  };
  return {
    x: defaultAnchor
      ? {
          edge: defaultAnchor.endsWith('l')
            ? 'start'
            : defaultAnchor.endsWith('r')
              ? 'end'
              : 'center',
          inset: margin,
        }
      : axis(origin.x, geometry.width, area.x, area.width),
    y: defaultAnchor
      ? {
          edge: defaultAnchor.startsWith('t')
            ? 'start'
            : defaultAnchor.startsWith('b')
              ? 'end'
              : 'center',
          inset: margin,
        }
      : axis(origin.y, geometry.height, area.y, area.height),
    anchor: { x: origin.x + geometry.anchor.x, y: origin.y + geometry.anchor.y },
  };
}

export function placedOrigin(placement: SpritePlacement, geometry: SpriteGeometry, area: Rect) {
  const axis = (
    pin: Axis,
    anchor: number,
    offset: number,
    size: number,
    start: number,
    span: number,
  ) =>
    !pin
      ? anchor - offset
      : pin.edge === 'start'
        ? start + pin.inset
        : pin.edge === 'end'
          ? start + span - size - pin.inset
          : start + (span - size) / 2;
  return {
    x: axis(placement.x, placement.anchor.x, geometry.anchor.x, geometry.width, area.x, area.width),
    y: axis(
      placement.y,
      placement.anchor.y,
      geometry.anchor.y,
      geometry.height,
      area.y,
      area.height,
    ),
  };
}
