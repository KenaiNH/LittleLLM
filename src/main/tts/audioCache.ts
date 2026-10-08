import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../../shared/config';
const cacheFile = /^[a-f0-9]{64}\.audio$/;
export function audioCacheKey(config: Config['tts'], text: string, format: string) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.provider,
        config.voice,
        config.speed,
        format,
        text.replace(/\s+/g, ' ').trim(),
      ]),
    )
    .digest('hex');
}
export class AudioCache {
  constructor(
    private directory: string,
    private cap = 200 * 1024 * 1024,
  ) {
    mkdirSync(directory, { recursive: true });
    if (lstatSync(directory).isSymbolicLink())
      throw new Error('Audio cache must be a regular directory.');
    this.evict();
  }
  private entries() {
    return readdirSync(this.directory)
      .filter((name) => cacheFile.test(name))
      .flatMap((name) => {
        const path = join(this.directory, name),
          stat = lstatSync(path);
        return stat.isFile() && !stat.isSymbolicLink()
          ? [{ path, size: stat.size, used: stat.mtimeMs }]
          : [];
      });
  }
  get size() {
    return this.entries().reduce((sum, item) => sum + item.size, 0);
  }
  scope(config: Config['tts']) {
    // Keep the specified utterance key, while preventing reuse after external config edits/restarts.
    const owner = createHash('sha256')
      .update(
        JSON.stringify([config.provider, config.voice, config.baseUrl, config.model, config.pitch]),
      )
      .digest('hex');
    const path = join(this.directory, 'owner.sha256');
    let previous = '';
    try {
      previous = readFileSync(path, 'utf8').trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (previous !== owner) {
      this.clear();
      writeFileSync(path, owner + '\n');
    }
  }
  get(key: string): Uint8Array | null {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid cache key');
    const entry = this.entries().find((item) => item.path === join(this.directory, key + '.audio'));
    if (!entry || entry.size > 32 * 1024 * 1024) return null;
    const result = readFileSync(entry.path);
    utimesSync(entry.path, new Date(), new Date());
    return result;
  }
  put(key: string, bytes: Uint8Array) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid cache key');
    if (!bytes.length || bytes.length > Math.min(this.cap, 32 * 1024 * 1024)) return;
    const path = join(this.directory, key + '.audio'),
      temporary = join(this.directory, randomUUID() + '.tmp');
    try {
      writeFileSync(temporary, bytes, { flag: 'wx' });
      renameSync(temporary, path);
      this.evict();
    } finally {
      try {
        unlinkSync(temporary);
      } catch {
        /* Already renamed. */
      }
    }
  }
  clear() {
    for (const entry of this.entries()) unlinkSync(entry.path);
  }
  private evict() {
    const entries = this.entries().sort((a, b) => a.used - b.used);
    let size = entries.reduce((sum, item) => sum + item.size, 0);
    for (const entry of entries) {
      if (size <= this.cap) break;
      unlinkSync(entry.path);
      size -= entry.size;
    }
  }
}
