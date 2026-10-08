import { createReadStream } from 'node:fs';
import sharp from 'sharp';
import { ProviderError } from '../llm/errors';
export class SpriteImportError extends ProviderError {
  constructor(message: string) {
    super({ code: 'FILE_INVALID', userMessage: message, retryable: false });
  }
}
export const SPRITE_FILE_LIMIT = 25 * 1024 * 1024;
export async function boundedFile(path: string, limit = SPRITE_FILE_LIMIT) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > limit) throw new SpriteImportError('File exceeds the import size limit');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
export async function inspectRaster(bytes: Buffer) {
  if (!bytes.length || bytes.length > SPRITE_FILE_LIMIT)
    throw new SpriteImportError('Sprite must be at most 25 MB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    gif = ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)),
    webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !gif && !webp)
    throw new SpriteImportError(
      'Use a PNG, APNG, GIF or WebP image; the file contents do not match a supported image',
    );
  const metadata = await sharp(bytes, {
    animated: true,
    limitInputPixels: 8192 * 8192 * 512,
  }).metadata();
  const width = metadata.width ?? 0,
    height = metadata.pageHeight ?? metadata.height ?? 0;
  let frames = metadata.pages ?? 1;
  if (png)
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (offset + length + 12 > bytes.length) throw new SpriteImportError('Truncated PNG');
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') {
        if (length !== 8) throw new SpriteImportError('Invalid APNG');
        frames = bytes.readUInt32BE(offset + 8);
      }
      offset += length + 12;
    }
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || frames < 1 || frames > 512)
    throw new SpriteImportError(
      'Sprite dimensions or animation frame count exceed the supported limits',
    );
  return { width, height, frames, extension: png ? 'png' : gif ? 'gif' : 'webp' };
}
