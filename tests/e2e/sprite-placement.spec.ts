import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { defaults } from '../../src/shared/config';
import { launchEnvironment } from './environment';

test('sprite stays attached through state sizes, scaling, bubbles and restart', async () => {
  test.setTimeout(60000);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-sprite-position-'));
  const cfg = defaults();
  cfg.advanced.developerMode = true;
  cfg.sprite.crossfadeMs = 100;
  for (const [state, width, height] of [
    ['idle', 128, 128],
    ['thinking', 256, 64],
    ['speaking', 64, 256],
  ] as const) {
    await mkdir(join(directory, 'sprites', state), { recursive: true });
    await sharp({ create: { width, height, channels: 4, background: '#ff0000' } })
      .png()
      .toFile(join(directory, 'sprites', state, 'fixture.png'));
    cfg.sprite[state].source = 'fixture.png';
  }
  await writeFile(join(directory, 'config.json'), JSON.stringify(cfg));
  const env = launchEnvironment(directory);
  let app = await _electron.launch({ args: ['out/main/index.js'], env });
  try {
    let pet = await app.firstWindow();
    const edges = () =>
      pet.evaluate(async () => {
        const result = await window.companion.getPetViewport();
        if (!result.ok) throw new Error('No viewport');
        const v = result.value;
        return {
          right: Math.round(
            v.workArea.x + v.workArea.width - v.window.x - v.sprite.x - v.sprite.width,
          ),
          bottom: Math.round(
            v.workArea.y + v.workArea.height - v.window.y - v.sprite.y - v.sprite.height,
          ),
        };
      });
    await expect(pet.getByTestId('sprite')).toHaveAttribute('data-fade', '1');
    await expect.poll(edges).toEqual({ right: 24, bottom: 24 });
    const savedPositions = () =>
      pet.evaluate(async () => {
        const result = await window.companion.getConfig();
        if (!result.ok) throw new Error('No config');
        return result.value.window.positions;
      });
    const initialPositions = await savedPositions();
    for (const state of ['thinking', 'speaking', 'idle', 'thinking', 'idle'] as const) {
      expect((await pet.evaluate((value) => window.companion.overrideState(value), state)).ok).toBe(
        true,
      );
      await expect
        .poll(() =>
          pet.getByTestId('sprite').evaluate((node) => node.getBoundingClientRect().width),
        )
        .toBe(state === 'thinking' ? 256 : state === 'speaking' ? 64 : 128);
      await expect(pet.getByTestId('sprite')).toHaveAttribute('data-fade', '1');
      await expect.poll(edges).toEqual({ right: 24, bottom: 24 });
      expect(await savedPositions()).toEqual(initialPositions);
    }
    for (const scale of [2, 0.5, 1.5, 1]) {
      await pet.evaluate(async (scale) => {
        const result = await window.companion.getConfig();
        if (!result.ok) throw new Error('No config');
        await window.companion.setConfig('sprite', {
          ...result.value.sprite,
          scale,
          flipHorizontal: true,
        });
      }, scale);
      await expect
        .poll(() =>
          pet.getByTestId('sprite').evaluate((node) => node.getBoundingClientRect().width),
        )
        .toBe(128 * scale);
      await expect.poll(edges).toEqual({ right: 24, bottom: 24 });
    }
    // Exercise real main-process layout including bubble offsets and contraction.
    for (const bubble of [{ width: 560, height: 250 }, { width: 700, height: 400 }, null]) {
      await pet.evaluate(
        (size) => window.companion.layoutPet({ width: 128, height: 128 }, size, { x: 64, y: 128 }),
        bubble,
      );
      await expect.poll(edges).toEqual({ right: 24, bottom: 24 });
    }
    for (const anchor of ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br'] as const) {
      await pet.evaluate(async (defaultAnchor) => {
        const result = await window.companion.getConfig();
        if (!result.ok) throw new Error('No config');
        await window.companion.setConfig('window', {
          ...result.value.window,
          restorePosition: false,
          defaultAnchor,
        });
      }, anchor);
      for (const scale of [2, 1]) {
        await pet.evaluate(async (scale) => {
          const result = await window.companion.getConfig();
          if (!result.ok) throw new Error('No config');
          await window.companion.setConfig('sprite', { ...result.value.sprite, scale });
        }, scale);
        await expect
          .poll(() =>
            pet.getByTestId('sprite').evaluate((node) => node.getBoundingClientRect().width),
          )
          .toBe(128 * scale);
        await expect
          .poll(() =>
            pet.evaluate(async (anchor) => {
              const result = await window.companion.getPetViewport();
              if (!result.ok) throw new Error('No viewport');
              const v = result.value,
                s = v.sprite,
                a = v.workArea;
              const x = anchor.endsWith('l')
                ? a.x + 24
                : anchor.endsWith('r')
                  ? a.x + a.width - s.width - 24
                  : a.x + (a.width - s.width) / 2;
              const y = anchor.startsWith('t')
                ? a.y + 24
                : anchor.startsWith('b')
                  ? a.y + a.height - s.height - 24
                  : a.y + (a.height - s.height) / 2;
              return { x: Math.round(v.window.x + s.x - x), y: Math.round(v.window.y + s.y - y) };
            }, anchor),
          )
          .toEqual({ x: 0, y: 0 });
      }
    }
    await app.close();
    app = await _electron.launch({ args: ['out/main/index.js'], env });
    pet = await app.firstWindow();
    await expect(pet.getByTestId('sprite')).toHaveAttribute('data-fade', '1');
    await expect.poll(edges).toEqual({ right: 24, bottom: 24 });
    // Dragging with a bubble must snap sprite edges, not the surrounding window.
    await pet.evaluate(() =>
      window.companion.layoutPet(
        { width: 128, height: 128 },
        { width: 560, height: 250 },
        { x: 64, y: 128 },
      ),
    );
    await pet.evaluate(async () => {
      const result = await window.companion.getPetViewport();
      if (!result.ok) throw new Error('No viewport');
      const v = result.value;
      window.companion.movePet(
        v.workArea.x + v.workArea.width - 128 - 8 - v.sprite.x,
        v.workArea.y + v.workArea.height - 128 - 8 - v.sprite.y,
      );
    });
    await expect.poll(edges).toEqual({ right: 0, bottom: 0 });
    await pet.evaluate(() =>
      window.companion.layoutPet({ width: 256, height: 64 }, null, { x: 0, y: 32 }),
    );
    await expect.poll(edges).toEqual({ right: 0, bottom: 0 });
    await pet.evaluate(() =>
      window.companion.layoutPet({ width: 128, height: 128 }, null, { x: 64, y: 128 }),
    );
    await expect.poll(edges).toEqual({ right: 0, bottom: 0 });
    await pet.evaluate(async () => {
      const result = await window.companion.getConfig();
      if (!result.ok) throw new Error('No config');
      await window.companion.setConfig('window', { ...result.value.window, restorePosition: true });
    });
    await app.close();
    app = await _electron.launch({ args: ['out/main/index.js'], env });
    pet = await app.firstWindow();
    await expect(pet.getByTestId('sprite')).toHaveAttribute('data-fade', '1');
    await expect.poll(edges).toEqual({ right: 0, bottom: 0 });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
