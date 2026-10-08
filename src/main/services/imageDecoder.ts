import sharp, { type Metadata } from 'sharp';
import UPNG from 'upng-js';
import { readFile } from 'node:fs/promises';
import type { SpriteStateConfig } from '../../shared/config';
import { sheetFrames } from '../../shared/animation';
export type DecodedFrame = { pixels: Buffer; width: number; height: number; delayMs: number };
export async function decodeImage(
  path: string,
  cfg: SpriteStateConfig,
  budgetBytes: number,
): Promise<DecodedFrame[]> {
  const input = await readFile(path);
  if (input.length > 25 * 1024 * 1024) throw new Error('Sprite exceeds 25 MB');
  const isPng = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let pngCount = 1;
  if (isPng) {
    if (input.length < 24) throw new Error('Invalid PNG');
    for (let offset = 8; offset + 12 <= input.length;) {
      const length = input.readUInt32BE(offset);
      if (offset + 12 + length > input.length) throw new Error('Truncated PNG');
      if (input.toString('ascii', offset + 4, offset + 8) === 'acTL') {
        if (length !== 8) throw new Error('Invalid animation header');
        pngCount = input.readUInt32BE(offset + 8);
      }
      offset += length + 12;
    }
  }
  const meta: Pick<Metadata, 'width' | 'height' | 'pages' | 'pageHeight' | 'format' | 'delay'> =
    isPng
      ? {
          width: input.readUInt32BE(16),
          height: input.readUInt32BE(20),
          pages: pngCount,
          format: 'png',
        }
      : await sharp(input, { animated: true, limitInputPixels: 8192 * 8192 * 512 }).metadata();
  const width = meta.width,
    height = meta.pageHeight ?? meta.height,
    count = meta.pages ?? 1;
  if (!width || !height || width > 8192 || height > 8192 || count > 512)
    throw new Error('Sprite dimensions or frame count exceed limits');
  if (width * height * 4 * count > budgetBytes)
    throw new Error('Decoded sprite exceeds cache budget');
  if (cfg.mode === 'sheet') {
    const rects = sheetFrames(width, height, cfg);
    if (rects.reduce((n, f) => n + f.width * f.height * 4, 0) > budgetBytes)
      throw new Error('Sheet exceeds cache budget');
    const source = isPng
      ? Buffer.from(
          UPNG.toRGBA8(
            UPNG.decode(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)),
          )[0] ?? new ArrayBuffer(0),
        )
      : input;
    return Promise.all(
      rects.map(async (rect) => ({
        pixels: await sharp(source, isPng ? { raw: { width, height, channels: 4 } } : {})
          .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
          .ensureAlpha()
          .raw()
          .toBuffer(),
        width: rect.width,
        height: rect.height,
        delayMs: 1000 / cfg.fps,
      })),
    );
  }
  if (meta.format === 'png') {
    const image = UPNG.decode(
      input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
    );
    if (
      image.frames.length > 512 ||
      image.width * image.height * 4 * Math.max(1, image.frames.length) > budgetBytes
    )
      throw new Error('Animated PNG exceeds limits');
    const frames = UPNG.toRGBA8(image);
    return frames.map((pixels, index) => ({
      pixels: Buffer.from(pixels),
      width: image.width,
      height: image.height,
      delayMs:
        cfg.gifTimingSource === 'file'
          ? Math.max(10, image.frames[index]?.delay ?? 1000 / cfg.fps)
          : 1000 / cfg.fps,
    }));
  }
  const { data } = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Array.from({ length: count }, (_, index) => ({
    pixels: Buffer.from(
      data.subarray(index * width * height * 4, (index + 1) * width * height * 4),
    ),
    width,
    height,
    delayMs:
      cfg.gifTimingSource === 'file'
        ? Math.max(10, meta.delay?.[index] ?? 1000 / cfg.fps)
        : 1000 / cfg.fps,
  }));
}
