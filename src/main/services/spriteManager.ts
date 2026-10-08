import { mkdir, readdir, lstat, writeFile, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, basename, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConfigStore } from './configStore';
import { SpriteLoader, naturalSort } from './spriteLoader';
import {
  spriteSchema,
  spriteStateSchema,
  mouthSchema,
  relativePathSchema,
  type SpriteConfig,
  type SpriteStateConfig,
} from '../../shared/config';
import { applySpriteFields, type SpriteTarget, type SpritePack } from '../../shared/spriteImport';
import { boundedFile, inspectRaster, SpriteImportError } from './spriteFiles';
type Imported = {
  state: SpriteTarget;
  source: string;
  width: number;
  height: number;
  count: number;
  dir: string;
};
export class SpriteManager {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private config: ConfigStore,
    readonly loader: SpriteLoader,
  ) {}
  private transaction<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async discard(dir: string) {
    const root = resolve(this.loader.root),
      target = resolve(dir);
    if (!target.startsWith(root + sep) || !/^[0-9a-f-]{36}$/.test(basename(target)))
      throw new SpriteImportError('Refused an invalid import cleanup path');
    await rm(target, { recursive: true, force: true });
  }
  private async copy(
    state: SpriteTarget,
    mode: SpriteStateConfig['mode'],
    paths: string[],
  ): Promise<Imported> {
    if (mode !== 'frames' && paths.length !== 1)
      throw new SpriteImportError('Select one image for a static sprite or sheet');
    let sources = paths;
    if (mode === 'frames' && paths.length === 1 && (await lstat(paths[0] ?? '')).isDirectory()) {
      const directory = paths[0] ?? '';
      sources = naturalSort(
        (await readdir(directory)).filter((name) => /\.(png|webp|gif|apng)$/i.test(name)),
      ).map((name) => join(directory, name));
    } else
      sources = [...sources].sort((a, b) =>
        basename(a) === basename(b)
          ? a.localeCompare(b)
          : naturalSort([basename(a), basename(b)])[0] === basename(a)
            ? -1
            : 1,
      );
    if (!sources.length || sources.length > 512)
      throw new SpriteImportError('Select 1–512 sprite frames');
    const id = randomUUID(),
      dir = join(await this.loader.directory(state, 'imports'), id);
    await mkdir(dir, { recursive: true });
    try {
      let width = 0,
        height = 0,
        firstFile = '';
      let sourceBytes = 0;
      if (mode === 'frames') await mkdir(join(dir, 'frames'));
      for (const [index, path] of sources.entries()) {
        if (!(await lstat(path)).isFile())
          throw new SpriteImportError('Choose regular image files, without symbolic links');
        const bytes = await boundedFile(path),
          meta = await inspectRaster(bytes);
        sourceBytes += bytes.length;
        if (sourceBytes > Math.max(256, this.config.get().advanced.spriteCacheMb) * 1024 * 1024)
          throw new SpriteImportError(
            'This image sequence exceeds the bounded import size. Remove oversized metadata or increase the sprite cache budget.',
          );
        if (mode === 'frames' && width && (width !== meta.width || height !== meta.height))
          throw new SpriteImportError('All sequence frames must have equal dimensions');
        width = meta.width;
        height = meta.height;
        const file =
          mode === 'frames'
            ? `frames/${String(index).padStart(4, '0')}.${meta.extension}`
            : `asset.${meta.extension}`;
        await writeFile(join(dir, file), bytes);
        firstFile = file;
      }
      return {
        state,
        source: `imports/${id}/${mode === 'frames' ? 'frames' : firstFile}`,
        width,
        height,
        count: sources.length,
        dir,
      };
    } catch (error) {
      await this.discard(dir);
      throw error;
    }
  }
  private stateConfig(
    current: SpriteStateConfig,
    mode: SpriteStateConfig['mode'],
    imported: Imported,
  ): SpriteStateConfig {
    let frameWidth: number | undefined,
      frameHeight: number | undefined,
      columns: number | undefined,
      frameCount: number | undefined;
    if (mode === 'sheet') {
      const cell = Math.min(imported.width, imported.height);
      frameWidth =
        imported.width % cell === 0 && imported.height % cell === 0 ? cell : imported.width;
      frameHeight =
        imported.width % cell === 0 && imported.height % cell === 0 ? cell : imported.height;
      columns = Math.floor(imported.width / frameWidth);
      frameCount = columns * Math.floor(imported.height / frameHeight);
    }
    return spriteStateSchema.parse({
      ...current,
      mode,
      source: imported.source,
      frameWidth,
      frameHeight,
      columns,
      frameCount,
    });
  }
  private async validate(sprite: SpriteConfig) {
    try {
      await this.loader.assets(sprite, this.config.get().advanced.spriteCacheMb);
    } catch {
      throw new SpriteImportError(
        'These frames do not fit the selected sheet dimensions, frame count or sprite cache budget. Check the metadata and matching frame sizes.',
      );
    }
  }
  import(state: SpriteTarget, mode: SpriteStateConfig['mode'], paths: string[]) {
    return this.transaction(async () => {
      if (state === 'mouth' && mode === 'static')
        throw new SpriteImportError('Mouth frames need a sheet or image sequence');
      const imported = await this.copy(state, mode, paths);
      try {
        const cfg = this.config.get(),
          sprite = { ...cfg.sprite };
        if (state === 'mouth') {
          let cell = imported.width,
            divisor = imported.height;
          while (divisor) [cell, divisor] = [divisor, cell % divisor];
          const cells = (imported.width / cell) * (imported.height / cell);
          const grid = mode === 'sheet' && cells >= 2 && cells <= 8;
          const count = mode === 'frames' ? imported.count : grid ? cells : sprite.mouth.frameCount;
          const frameWidth =
            mode === 'frames' ? imported.width : grid ? cell : imported.width / count;
          if (!Number.isInteger(frameWidth))
            throw new SpriteImportError(
              'The mouth strip width must divide evenly by its frame count',
            );
          sprite.mouth = mouthSchema.parse({
            ...sprite.mouth,
            mode,
            source: imported.source,
            frameWidth,
            frameHeight: grid ? cell : imported.height,
            frameCount: count,
          });
        } else
          sprite[state] = this.stateConfig(
            sprite[state] ?? spriteStateSchema.parse({}),
            mode,
            imported,
          );
        await this.validate(sprite);
        return this.config.set('sprite', sprite);
      } catch (error) {
        await this.discard(imported.dir);
        throw error;
      }
    });
  }
  patchState(state: SpriteTarget, changes: Record<string, unknown>) {
    return this.transaction(async () => {
      const sprite = this.config.get().sprite;
      if (state === 'mouth') {
        const old = sprite.mouth;
        sprite.mouth = mouthSchema.parse(applySpriteFields(sprite.mouth, changes));
        if (
          changes.frameCount !== undefined &&
          sprite.mouth.mode === 'sheet' &&
          sprite.mouth.source
        ) {
          const meta = await inspectRaster(
            await boundedFile(await this.loader.resolveAsset('mouth', sprite.mouth.source)),
          );
          if (old.frameHeight === meta.height) {
            const frameWidth = meta.width / sprite.mouth.frameCount;
            if (!Number.isInteger(frameWidth))
              throw new SpriteImportError(
                'The mouth strip width must divide evenly by its frame count',
              );
            sprite.mouth = mouthSchema.parse({ ...sprite.mouth, frameWidth });
          }
        }
      } else {
        const old = sprite[state] ?? spriteStateSchema.parse({});
        let next = spriteStateSchema.parse(applySpriteFields(old, changes));
        if (changes.mode && changes.mode !== old.mode) {
          const source = await this.loader.resolveAsset(state, old.source),
            info = await lstat(source);
          if (
            (next.mode === 'frames' && !info.isDirectory()) ||
            (next.mode !== 'frames' && info.isDirectory())
          )
            throw new SpriteImportError('Import a new file or folder for this source type');
          if (next.mode === 'sheet') {
            const meta = await inspectRaster(await boundedFile(source));
            next = this.stateConfig(next, 'sheet', {
              state,
              source: next.source,
              dir: '',
              count: 1,
              ...meta,
            });
          }
        }
        if (
          next.mode === 'sheet' &&
          (changes.frameWidth !== undefined || changes.frameHeight !== undefined) &&
          changes.frameCount === undefined
        ) {
          const meta = await inspectRaster(
            await boundedFile(await this.loader.resolveAsset(state, next.source)),
          );
          next.columns = Math.floor(meta.width / (next.frameWidth ?? meta.width));
          next.frameCount =
            next.columns * Math.floor(meta.height / (next.frameHeight ?? meta.height));
          next = spriteStateSchema.parse(next);
        }
        sprite[state] = next;
      }
      await this.validate(sprite);
      return this.config.set('sprite', sprite);
    });
  }
  patch(changes: Record<string, unknown>) {
    return this.transaction(async () => {
      const sprite = spriteSchema.parse({ ...this.config.get().sprite, ...changes });
      await this.validate(sprite);
      return this.config.set('sprite', sprite);
    });
  }
  reset(state: SpriteTarget) {
    return this.transaction(async () => {
      const sprite = this.config.get().sprite;
      if (state === 'mouth') sprite.mouth = mouthSchema.parse({});
      else if (state === 'listening') {
        sprite.listening = undefined;
        sprite.listeningBehavior = 'use-idle';
      } else {
        await this.restoreDefault(state);
        sprite[state] = spriteStateSchema.parse({});
      }
      await this.validate(sprite);
      return this.config.set('sprite', sprite);
    });
  }
  private async restoreDefault(state: 'idle' | 'thinking' | 'speaking') {
    const root = await this.loader.stateRoot(state),
      temporary = join(root, `default.${randomUUID()}.tmp`);
    const bytes = await boundedFile(
      fileURLToPath(new URL(`../../assets/default-sprites/${state}.png`, import.meta.url)),
    );
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, join(root, 'default.png'));
  }
  resetAll() {
    return this.transaction(async () => {
      for (const state of ['idle', 'thinking', 'speaking'] as const)
        await this.restoreDefault(state);
      const sprite = spriteSchema.parse({});
      await this.validate(sprite);
      return this.config.set('sprite', sprite);
    });
  }
  async exportPack(): Promise<{ manifest: SpritePack; files: Record<string, Uint8Array> }> {
    const cfg = this.config.get(),
      files: Record<string, Uint8Array> = {};
    const states: SpriteTarget[] = [
      'idle',
      'thinking',
      'speaking',
      ...(cfg.sprite.listening ? ['listening' as const] : []),
      ...(cfg.sprite.mouth.source ? ['mouth' as const] : []),
    ];
    for (const state of states) {
      const spec = cfg.sprite[state];
      if (!spec?.source) continue;
      const path = await this.loader.resolveAsset(state, spec.source);
      if (spec.mode === 'frames') {
        for (const name of naturalSort(
          (await readdir(path)).filter((name) => /\.(png|webp|gif|apng)$/i.test(name)),
        )) {
          relativePathSchema.parse(name);
          files[`${state}/${spec.source}/${name}`] = await boundedFile(
            await this.loader.resolveAsset(state, spec.source + '/' + name),
          );
        }
      } else files[`${state}/${spec.source}`] = await boundedFile(path);
    }
    const packId = cfg.sprite.idle.source.split('/')[1],
      persona = cfg.persona.library.find((card) => card.spritePackId === packId);
    return {
      manifest: {
        version: 1,
        name: 'Sprite Pack',
        sprite: cfg.sprite,
        ...(persona ? { persona } : {}),
      },
      files,
    };
  }
  importPack(pack: { manifest: SpritePack; files: Record<string, Uint8Array> }) {
    return this.transaction(async () => {
      const sprite = structuredClone(pack.manifest.sprite),
        created: string[] = [],
        packId = randomUUID();
      try {
        const states: SpriteTarget[] = [
          'idle',
          'thinking',
          'speaking',
          ...(sprite.listening ? ['listening' as const] : []),
          ...(sprite.mouth.source ? ['mouth' as const] : []),
        ];
        for (const state of states) {
          const spec = sprite[state];
          if (!spec?.source) continue;
          const id = packId,
            dir = join(await this.loader.directory(state, 'imports'), id);
          await mkdir(dir, { recursive: true });
          created.push(dir);
          const prefix = `${state}/${spec.source}`,
            names =
              spec.mode === 'frames'
                ? naturalSort(
                    Object.keys(pack.files).filter(
                      (name) =>
                        name.startsWith(prefix + '/') &&
                        !name.slice(prefix.length + 1).includes('/'),
                    ),
                  )
                : [prefix];
          if (!names.length || names.length > 512)
            throw new SpriteImportError(`Pack has no valid ${state} asset`);
          if (spec.mode === 'frames') await mkdir(join(dir, 'frames'));
          let source = '',
            index = 0;
          for (const name of names) {
            const bytes = pack.files[name];
            if (!bytes) throw new SpriteImportError(`Pack is missing ${state} artwork`);
            const meta = await inspectRaster(Buffer.from(bytes));
            source = spec.mode === 'frames' ? 'frames' : `asset.${meta.extension}`;
            await writeFile(
              join(
                dir,
                spec.mode === 'frames'
                  ? `frames/${String(index++).padStart(4, '0')}.${meta.extension}`
                  : source,
              ),
              bytes,
            );
          }
          spec.source = `imports/${id}/${source}`;
        }
        await this.validate(sprite);
        const persona = this.config.get().persona;
        if (pack.manifest.persona && persona.packPersonaPolicy !== 'ignore') {
          if (persona.library.length >= 50)
            throw new SpriteImportError(
              'The persona library is full. Free a card slot before importing this pack, or set its persona policy to Ignore.',
            );
          const card = { ...pack.manifest.persona, id: randomUUID(), spritePackId: packId };
          // Activation and policy consent are completed in the ordered Persona phase.
          // Preserve the bundled card now without enabling unavailable runtime behavior.
          return this.config.setSections({
            sprite,
            persona: { ...persona, library: [...persona.library, card] },
          });
        }
        return this.config.set('sprite', sprite);
      } catch (error) {
        for (const dir of created) await this.discard(dir);
        throw error;
      }
    });
  }
}
