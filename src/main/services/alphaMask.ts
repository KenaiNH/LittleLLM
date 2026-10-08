import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SpriteAssets, SpriteAsset } from '../../shared/sprites';
import type { SpriteLoader } from './spriteLoader';
export class AlphaMaskCache {
  private memory = new Map<string, { width: number; height: number; alphaBase64: string }>();
  constructor(
    private userData: string,
    private loader: SpriteLoader,
  ) {}
  private async get(asset: SpriteAsset) {
    const id = createHash('sha256').update(JSON.stringify(asset)).digest('hex');
    const cached = this.memory.get(id);
    if (cached) return cached;
    const dir = join(this.userData, 'cache', 'masks');
    await mkdir(dir, { recursive: true });
    const path = join(dir, id + '.alpha');
    let alpha: Buffer;
    try {
      alpha = await readFile(path);
      if (alpha.length !== asset.width * asset.height) throw new Error('Corrupt mask');
    } catch {
      alpha = Buffer.alloc(asset.width * asset.height);
      for (const frame of asset.frames) {
        const rgba = await sharp(await this.loader.protocolPath(new URL(frame.url)))
          .ensureAlpha()
          .raw()
          .toBuffer();
        for (let index = 0; index < alpha.length; index++)
          alpha[index] = Math.max(alpha[index] ?? 0, rgba[index * 4 + 3] ?? 0);
      }
      await writeFile(path, alpha);
    }
    const value = {
      width: asset.width,
      height: asset.height,
      alphaBase64: alpha.toString('base64'),
    };
    this.memory.set(id, value);
    if (this.memory.size > 8) this.memory.delete(this.memory.keys().next().value ?? '');
    return value;
  }
  async masks(assets: SpriteAssets) {
    const result: Record<string, { width: number; height: number; alphaBase64: string }> = {};
    for (const [key, asset] of Object.entries(assets))
      if (asset) result[key] = await this.get(asset);
    return result;
  }
}
