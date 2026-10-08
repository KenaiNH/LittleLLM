export type AlphaMask = { width: number; height: number; alpha: Uint8Array };
export function sourcePixel(input: {
  cursorDip: { x: number; y: number };
  windowDip: { x: number; y: number };
  canvasCss: { x: number; y: number };
  scale: number;
  dpi: number;
  scaleMode: 'fixed' | 'dpi-aware';
  flip: boolean;
  width: number;
  height: number;
}): { x: number; y: number } | null {
  const cssScale = input.scale / (input.scaleMode === 'fixed' ? input.dpi : 1);
  if (cssScale <= 0 || input.dpi <= 0) return null;
  const deviceX = (input.cursorDip.x - input.windowDip.x - input.canvasCss.x) * input.dpi;
  const deviceY = (input.cursorDip.y - input.windowDip.y - input.canvasCss.y) * input.dpi;
  let x = Math.floor(deviceX / (cssScale * input.dpi));
  const y = Math.floor(deviceY / (cssScale * input.dpi));
  if (x < 0 || y < 0 || x >= input.width || y >= input.height) return null;
  if (input.flip) x = input.width - 1 - x;
  return { x, y };
}
export function alphaHit(
  mask: AlphaMask,
  point: { x: number; y: number } | null,
  threshold: number,
): boolean {
  return point !== null && (mask.alpha[point.y * mask.width + point.x] ?? 0) > threshold;
}
export function unionAlpha(frames: Uint8Array[], width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  for (const frame of frames) {
    if (frame.length !== width * height * 4) throw new Error('Frame dimensions mismatch');
    for (let i = 0; i < result.length; i++)
      result[i] = Math.max(result[i] ?? 0, frame[i * 4 + 3] ?? 0);
  }
  return result;
}
