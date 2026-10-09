export type SpriteGeometry = { width: number; height: number; anchor: { x: number; y: number } };
export function scaleGeometry(geometry: SpriteGeometry, scale: number): SpriteGeometry {
  return {
    width: geometry.width * scale,
    height: geometry.height * scale,
    anchor: { x: geometry.anchor.x * scale, y: geometry.anchor.y * scale },
  };
}
export function geometryFitScale(
  geometry: SpriteGeometry,
  area: { width: number; height: number },
  dpi = 1,
) {
  // Bound both DIP IPC sizes and physical backing textures without stretching.
  return Math.min(
    1,
    Math.min(10000, area.width, 4096 / dpi) / geometry.width,
    Math.min(10000, area.height, 4096 / dpi) / geometry.height,
  );
}
export function frameGeometry(
  width: number,
  height: number,
  scale: number,
  anchor: { x: number; y: number },
  flip: boolean,
): SpriteGeometry {
  return {
    width: width * scale,
    height: height * scale,
    anchor: { x: width * scale * (flip ? 1 - anchor.x : anchor.x), y: height * scale * anchor.y },
  };
}
// All rectangles share the same world-space anchor, including flipped artwork.
export function unionGeometry(a: SpriteGeometry, b: SpriteGeometry): SpriteGeometry {
  const x = Math.max(a.anchor.x, b.anchor.x),
    y = Math.max(a.anchor.y, b.anchor.y);
  return {
    width: x + Math.max(a.width - a.anchor.x, b.width - b.anchor.x),
    height: y + Math.max(a.height - a.anchor.y, b.height - b.anchor.y),
    anchor: { x, y },
  };
}
export function anchoredOrigin(
  origin: { x: number; y: number },
  old: SpriteGeometry,
  next: SpriteGeometry,
) {
  return { x: origin.x + old.anchor.x - next.anchor.x, y: origin.y + old.anchor.y - next.anchor.y };
}
