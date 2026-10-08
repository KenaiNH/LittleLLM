import sharp from 'sharp';
import { lstat } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../shared/config';
import { chatImageSchema, type ChatImage, type Attachment } from '../../shared/attachments';
import { boundedFile, SpriteImportError } from './spriteFiles';
import { ProviderError } from '../llm/errors';
export const ATTACHMENT_LIMIT = 10 * 1024 * 1024;
function imageFormat(bytes: Buffer): 'png' | 'jpeg' | 'webp' | 'gif' {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  throw new SpriteImportError('Attach a PNG, JPEG, WebP or GIF image with valid image contents.');
}
export async function normalizeAttachment(
  bytes: Buffer,
  config: Config['llm'],
  name: string,
): Promise<{ view: Attachment; image: ChatImage }> {
  if (bytes.length > ATTACHMENT_LIMIT)
    throw new SpriteImportError('Each attachment must be at most 10 MiB before resizing.');
  const original = imageFormat(bytes),
    format =
      config.reencodeFormat === 'original'
        ? original === 'gif'
          ? 'png'
          : original
        : config.reencodeFormat;
  try {
    let pipeline = sharp(bytes, { pages: 1, limitInputPixels: 64 * 1024 * 1024 }).rotate();
    if (config.maxImageDim !== 'none')
      pipeline = pipeline.resize({
        width: Number(config.maxImageDim),
        height: Number(config.maxImageDim),
        fit: 'inside',
        withoutEnlargement: true,
      });
    const { data, info } = await pipeline
      .toFormat(format, { quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > ATTACHMENT_LIMIT)
      throw new SpriteImportError(
        'The normalized image is too large. Choose a smaller dimension or compressed format.',
      );
    const thumb = await sharp(data)
      .resize({ width: 160, height: 96, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const image = chatImageSchema.parse({
      mediaType: `image/${format}`,
      data: data.toString('base64'),
      width: info.width,
      height: info.height,
    });
    return {
      image,
      view: {
        id: randomUUID(),
        name: name.slice(0, 200),
        thumbnail: 'data:image/png;base64,' + thumb.toString('base64'),
        width: info.width,
        height: info.height,
      },
    };
  } catch (error) {
    if (error instanceof SpriteImportError) throw error;
    throw new SpriteImportError(
      'This image could not be decoded safely. Use a valid image below 64 megapixels.',
    );
  }
}
export class AttachmentStore {
  private items: { view: Attachment; image: ChatImage }[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  constructor(private getConfig: () => Config) {}
  get views() {
    return this.items.map((item) => item.view);
  }
  get images() {
    return this.items.map((item) => item.image);
  }
  clear() {
    this.epoch++;
    this.items = [];
  }
  remove(id: string) {
    this.items = this.items.filter((item) => item.view.id !== id);
  }
  add(inputs: { bytes: Buffer; name: string }[], epoch = this.epoch) {
    const task = this.queue.then(async () => {
      if (epoch !== this.epoch)
        throw new ProviderError({ code: 'ABORTED', userMessage: 'Cancelled', retryable: false });
      const cfg = this.getConfig().llm;
      if (this.items.length + inputs.length > cfg.maxAttachments)
        throw new SpriteImportError(
          `This message allows at most ${cfg.maxAttachments} attachments.`,
        );
      const items = [];
      for (const input of inputs)
        items.push(await normalizeAttachment(input.bytes, cfg, input.name));
      if (epoch !== this.epoch)
        throw new ProviderError({ code: 'ABORTED', userMessage: 'Cancelled', retryable: false });
      if (this.items.length + items.length > this.getConfig().llm.maxAttachments)
        throw new SpriteImportError('Remove attachments above the configured limit.');
      this.items.push(...items);
      return this.views;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  async files(paths: string[]) {
    const epoch = this.epoch;
    const inputs = [];
    for (const path of paths) {
      if (!(await lstat(path)).isFile())
        throw new SpriteImportError('Attach regular image files without symbolic links.');
      inputs.push({ bytes: await boundedFile(path, ATTACHMENT_LIMIT), name: basename(path) });
    }
    return this.add(inputs, epoch);
  }
}
