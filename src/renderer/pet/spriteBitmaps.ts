import type { SpriteAssets } from '../../shared/sprites';
export type BitmapSet = Partial<Record<keyof SpriteAssets, ImageBitmap[]>>;
export async function decodeSpriteAssets(
  assets: SpriteAssets,
  signal: AbortSignal,
): Promise<BitmapSet> {
  const result: BitmapSet = {};
  try {
    for (const [key, asset] of Object.entries(assets)) {
      if (!asset) continue;
      const frames: ImageBitmap[] = [];
      result[key as keyof SpriteAssets] = frames;
      for (const frame of asset.frames) {
        signal.throwIfAborted();
        const response = await fetch(frame.url, { signal });
        if (!response.ok) throw new Error('Sprite image unavailable');
        const bitmap = await createImageBitmap(await response.blob());
        frames.push(bitmap);
        signal.throwIfAborted();
      }
    }
    return result;
  } catch (error) {
    closeSpriteAssets(result);
    throw error;
  }
}
export function closeSpriteAssets(assets: BitmapSet) {
  for (const frames of Object.values(assets)) for (const frame of frames ?? []) frame.close();
}
