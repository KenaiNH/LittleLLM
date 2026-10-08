import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { configSchema, configSections, type ConfigSection } from '../../src/shared/config';
import type { ConfigStore } from '../../src/main/services/configStore';
import { SpriteLoader } from '../../src/main/services/spriteLoader';
import { SpriteManager } from '../../src/main/services/spriteManager';
import { inspectRaster, SPRITE_FILE_LIMIT } from '../../src/main/services/spriteFiles';
import { readSpritePack, writeSpritePack } from '../../src/main/services/spritePacks';
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-import-'));
  directories.push(directory);
  let config = configSchema.parse({});
  const store = {
    get: () => structuredClone(config),
    set: (section: ConfigSection, value: unknown) => {
      config = { ...config, [section]: configSections[section].parse(value) };
      return structuredClone(config);
    },
    setSections: (values: object) => {
      config = configSchema.parse({ ...config, ...values });
      return structuredClone(config);
    },
  } as unknown as ConfigStore;
  const loader = new SpriteLoader(directory),
    manager = new SpriteManager(store, loader);
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00cc88' } })
    .png()
    .toBuffer();
  for (const state of ['idle', 'thinking', 'speaking']) {
    await mkdir(join(loader.root, state), { recursive: true });
    await writeFile(join(loader.root, state, 'default.png'), png);
  }
  return { directory, store, loader, manager, png };
}
it('imports a sheet into every state, infers frames and decodes after deleting the original', async () => {
  const { directory, manager, store, loader } = await setup(),
    source = join(directory, 'original.png');
  await sharp({ create: { width: 96, height: 32, channels: 4, background: '#ff9900' } })
    .png()
    .toFile(source);
  for (const state of ['idle', 'thinking', 'speaking'] as const)
    await manager.import(state, 'sheet', [source]);
  await rm(source);
  const assets = await loader.assets(store.get().sprite);
  for (const state of ['idle', 'thinking', 'speaking'] as const) {
    expect(assets[state].frames).toHaveLength(3);
    expect(assets[state].width).toBe(32);
    expect(store.get().sprite[state].source).toMatch(/^imports\//);
  }
  await manager.patchState('idle', { frameWidth: 16 });
  expect(store.get().sprite.idle.frameCount).toBe(6);
  const previous = store.get().sprite;
  await expect(manager.patchState('idle', { frameCount: 512 })).rejects.toThrow();
  expect(store.get().sprite).toEqual(previous);
});
it('uses natural sequence order and rolls back invalid dimensions without changing active assets', async () => {
  const { directory, manager, store, loader } = await setup();
  const paths = [];
  for (const [name, color] of [
    ['frame10', '#ff0000'],
    ['frame2', '#00ff00'],
  ] as const) {
    const path = join(directory, name + '.png');
    await sharp({ create: { width: 16, height: 16, channels: 4, background: color } })
      .png()
      .toFile(path);
    paths.push(path);
  }
  await manager.import('thinking', 'frames', paths);
  const folder = await loader.resolveAsset('thinking', store.get().sprite.thinking.source),
    first = (await readdir(folder)).sort()[0];
  if (!first) throw new Error('Missing imported frames');
  const pixel = await sharp(await readFile(join(folder, first)))
    .raw()
    .toBuffer();
  expect(pixel[1]).toBe(255);
  expect(pixel[0]).toBe(0);
  const old = store.get().sprite.thinking;
  const mismatch = join(directory, 'mismatch.png');
  await sharp({ create: { width: 17, height: 16, channels: 4, background: 'blue' } })
    .png()
    .toFile(mismatch);
  await expect(manager.import('thinking', 'frames', [paths[0] ?? '', mismatch])).rejects.toThrow(
    'equal dimensions',
  );
  expect(store.get().sprite.thinking).toEqual(old);
});
it('rejects spoofed magic, oversized dimensions, zip traversal, duplicate names and expanded-file bombs', async () => {
  await expect(inspectRaster(Buffer.from('not an image'))).rejects.toThrow('contents');
  const wide = await sharp({ create: { width: 8193, height: 1, channels: 4, background: 'blue' } })
    .png()
    .toBuffer();
  await expect(inspectRaster(wide)).rejects.toThrow('dimensions');
  const manifest = Buffer.from(
    JSON.stringify({ version: 1, sprite: configSchema.parse({}).sprite }),
  );
  const invalidArchives: Record<string, Uint8Array>[] = [
    { 'pack.json': manifest, '../outside.png': new Uint8Array([1]) },
    {
      'pack.json': manifest,
      'idle/file.PNG': new Uint8Array([1]),
      'idle/FILE.png': new Uint8Array([1]),
    },
    { 'pack.json': manifest, 'huge.png': new Uint8Array(SPRITE_FILE_LIMIT + 1) },
  ];
  for (const files of invalidArchives)
    expect(() => readSpritePack(Buffer.from(zipSync(files, { level: 1 })))).toThrow();
});
it('round-trips a pack including optional mouth frames and retains bundled persona data without activation', async () => {
  const { directory, manager, store, loader } = await setup(),
    sheet = join(directory, 'sheet.png');
  await sharp({ create: { width: 96, height: 32, channels: 4, background: 'orange' } })
    .png()
    .toFile(sheet);
  await manager.import('mouth', 'sheet', [sheet]);
  expect((await loader.assets(store.get().sprite)).mouth?.frames).toHaveLength(3);
  const exported = await manager.exportPack();
  const pack = readSpritePack(Buffer.from(writeSpritePack(exported.manifest, exported.files)));
  // Use the full authoritative card defaults instead of relying on a handwritten fixture shape.
  const { personaCardSchema } = await import('../../src/shared/config');
  pack.manifest.persona = personaCardSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test persona',
  });
  await manager.importPack(pack);
  expect(store.get().persona.enabled).toBe(false);
  expect(store.get().persona.library[0]?.name).toBe('Test persona');
  expect((await loader.assets(store.get().sprite)).mouth?.frames).toHaveLength(3);
  expect((await manager.exportPack()).manifest.persona?.name).toBe('Test persona');
});
it('infers rectangular mouth strips and square grids and resizes strips when their count changes', async () => {
  const { directory, manager, store, loader } = await setup();
  const source = join(directory, 'mouth.png');
  await sharp({ create: { width: 192, height: 16, channels: 4, background: 'orange' } })
    .png()
    .toFile(source);
  await manager.import('mouth', 'sheet', [source]);
  expect(store.get().sprite.mouth.frameWidth).toBe(64);
  await manager.patchState('mouth', { frameCount: 6 });
  expect(store.get().sprite.mouth.frameWidth).toBe(32);
  expect((await loader.assets(store.get().sprite)).mouth?.frames).toHaveLength(6);
  await sharp({ create: { width: 64, height: 96, channels: 4, background: 'orange' } })
    .png()
    .toFile(source);
  await manager.import('mouth', 'sheet', [source]);
  expect(store.get().sprite.mouth).toMatchObject({
    frameCount: 6,
    frameWidth: 32,
    frameHeight: 32,
  });
});
it('rejects a redirected imports directory before writing external files', async () => {
  const { directory, loader, manager, png } = await setup(),
    outside = join(directory, 'outside'),
    source = join(directory, 'selected.png');
  await mkdir(outside);
  await writeFile(source, png);
  await symlink(
    outside,
    join(loader.root, 'thinking', 'imports'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(manager.import('thinking', 'static', [source])).rejects.toThrow(
    'leaves managed storage',
  );
  expect(await readdir(outside)).toEqual([]);
});
