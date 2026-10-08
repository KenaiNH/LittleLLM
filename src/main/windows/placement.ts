export type Rect = { x: number; y: number; width: number; height: number };
export function clampPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  area: Rect,
  margin = 0,
): { x: number; y: number } {
  const minX = area.x + margin,
    minY = area.y + margin;
  return {
    x: Math.round(
      Math.max(
        minX,
        Math.min(position.x, Math.max(minX, area.x + area.width - size.width - margin)),
      ),
    ),
    y: Math.round(
      Math.max(
        minY,
        Math.min(position.y, Math.max(minY, area.y + area.height - size.height - margin)),
      ),
    ),
  };
}
export function defaultPosition(
  size: { width: number; height: number },
  area: Rect,
  anchor: string,
  margin: number,
) {
  const x = anchor.endsWith('l')
    ? area.x + margin
    : anchor.endsWith('r')
      ? area.x + area.width - size.width - margin
      : area.x + (area.width - size.width) / 2;
  const y = anchor.startsWith('t')
    ? area.y + margin
    : anchor.startsWith('b')
      ? area.y + area.height - size.height - margin
      : area.y + (area.height - size.height) / 2;
  return clampPosition({ x, y }, size, area, margin);
}
export function snapPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  area: Rect,
  distance: number,
) {
  const right = area.x + area.width - size.width,
    bottom = area.y + area.height - size.height;
  return {
    x:
      Math.abs(position.x - area.x) <= distance
        ? area.x
        : Math.abs(position.x - right) <= distance
          ? right
          : position.x,
    y:
      Math.abs(position.y - area.y) <= distance
        ? area.y
        : Math.abs(position.y - bottom) <= distance
          ? bottom
          : position.y,
  };
}
