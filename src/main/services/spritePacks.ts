import { unzipSync, zipSync } from 'fflate';
import { relativePathSchema } from '../../shared/config';
import { spritePackSchema, type SpritePack } from '../../shared/spriteImport';
import { SPRITE_FILE_LIMIT, SpriteImportError } from './spriteFiles';
export const PACK_FILE_LIMIT = 128 * 1024 * 1024;
export const PACK_EXPANDED_LIMIT = 256 * 1024 * 1024;
export function readSpritePack(bytes: Buffer): {
  manifest: SpritePack;
  files: Record<string, Uint8Array>;
} {
  if (bytes.length > PACK_FILE_LIMIT) throw new SpriteImportError('Sprite Pack exceeds 128 MB');
  let total = 0,
    count = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (file) => {
      relativePathSchema.parse(file.name.endsWith('/') ? file.name.slice(0, -1) : file.name);
      const name = file.name.toLowerCase();
      if (names.has(name)) throw new SpriteImportError('Sprite Pack contains duplicate file names');
      names.add(name);
      if (++count > 2000) throw new SpriteImportError('Too many Sprite Pack entries');
      total += file.originalSize;
      if (
        file.originalSize > (file.name === 'pack.json' ? 1024 * 1024 : SPRITE_FILE_LIMIT) ||
        total > PACK_EXPANDED_LIMIT
      )
        throw new SpriteImportError('Expanded Sprite Pack exceeds its size limit');
      return !file.name.endsWith('/');
    },
  });
  if (!files['pack.json']) throw new SpriteImportError('Sprite Pack is missing pack.json');
  for (const [name, value] of Object.entries(files))
    if (value.length > (name === 'pack.json' ? 1024 * 1024 : SPRITE_FILE_LIMIT))
      throw new SpriteImportError('Sprite Pack file exceeds its size limit');
  const manifest = spritePackSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files['pack.json'])),
  );
  return { manifest, files };
}
export function writeSpritePack(manifest: SpritePack, files: Record<string, Uint8Array>) {
  const entries = {
    ...files,
    'pack.json': new TextEncoder().encode(
      JSON.stringify(spritePackSchema.parse(manifest), null, 2),
    ),
  };
  const total = Object.values(entries).reduce((sum, bytes) => sum + bytes.length, 0);
  if (total > PACK_EXPANDED_LIMIT)
    throw new SpriteImportError('Sprite Pack exceeds the export size limit');
  const bytes = zipSync(entries, { level: 0 });
  if (bytes.length > PACK_FILE_LIMIT) throw new SpriteImportError('Sprite Pack exceeds 128 MB');
  return bytes;
}
