import { net } from 'electron';
import sharp from 'sharp';
export class OutputImages {
  private cache = new Map<string, Buffer>();
  private pending = new Map<string, Promise<Buffer>>();
  async get(source: string): Promise<Buffer> {
    const url = new URL(source);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      source.length > 4096
    )
      throw new Error('Unsupported image URL');
    const cached = this.cache.get(source);
    if (cached) return cached;
    const pending = this.pending.get(source);
    if (pending) return pending;
    const promise = this.download(url)
      .then((buffer) => {
        this.cache.set(source, buffer);
        let size = Array.from(this.cache.values()).reduce((sum, item) => sum + item.length, 0);
        while (size > 32 * 1024 * 1024 || this.cache.size > 16) {
          const key = this.cache.keys().next().value;
          if (!key) break;
          size -= this.cache.get(key)?.length ?? 0;
          this.cache.delete(key);
        }
        return buffer;
      })
      .finally(() => this.pending.delete(source));
    this.pending.set(source, promise);
    return promise;
  }
  private async download(url: URL) {
    const response = await net.fetch(url.href, {
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.body) throw new Error('Image unavailable');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 10 * 1024 * 1024) throw new Error('Output image exceeds size limit');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks),
      header = bytes.subarray(0, 12);
    const raster =
      header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (header[0] === 255 && header[1] === 216 && header[2] === 255) ||
      /^GIF8[79]a/.test(header.toString('ascii')) ||
      (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP');
    if (!raster) throw new Error('Unsupported output image');
    const metadata = await sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8192 ||
      metadata.height > 8192 ||
      !['png', 'jpeg', 'webp', 'gif'].includes(metadata.format ?? '')
    )
      throw new Error('Unsupported output image');
    return sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 })
      .rotate()
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  }
}
