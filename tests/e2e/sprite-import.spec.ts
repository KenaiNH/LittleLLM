import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { launchEnvironment } from './environment';
import { readSpritePack } from '../../src/main/services/spritePacks';
// eslint-disable-next-line no-empty-pattern
test('Settings imports a user sheet into all states, previews, packs and survives original removal and restart', async ({}, info) => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-sprite-ui-')),
    source = join(directory, 'user-sheet.png'),
    packFile = join(directory, 'exported.zip');
  await sharp(
    Buffer.from(
      '<svg width="192" height="64"><rect width="64" height="64" fill="red"/><rect x="64" width="64" height="64" fill="lime"/><rect x="128" width="64" height="64" fill="blue"/></svg>',
    ),
  )
    .png()
    .toFile(source);
  let app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    let pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await pet.evaluate(() => window.companion.openSettings('Sprites'));
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings did not open');
    settings.on('pageerror', (error) => console.error('Sprites renderer error:', error.message));
    for (const state of ['Idle', 'Thinking', 'Speaking']) {
      const section = settings.locator(`[data-state-section=${state.toLowerCase()}]`);
      if (state !== 'Idle')
        await section.getByRole('button', { name: new RegExp(state + '$') }).click();
      await section.getByLabel(`${state} source type`).selectOption('sheet');
      await expect(section.getByLabel('Frame width', { exact: true })).toBeVisible();
      // Actual File objects cross the isolated preload; this also exercises the drop import path.
      await section.getByLabel(`${state} sprite files`).setInputFiles(source);
      await expect(section.getByLabel('Frame count', { exact: true })).toHaveValue('3');
      await expect(section.getByLabel('Frame width', { exact: true })).toHaveValue('64');
      await expect(section.getByLabel(`${state} frame scrubber`)).toHaveAttribute('max', '2');
      await section.getByLabel(`${state} frame scrubber`).focus();
      await section.getByLabel(`${state} frame scrubber`).press('End');
      await expect(section.getByLabel(`${state} frame scrubber`)).toHaveValue('2');
      await expect(section.getByRole('button', { name: `Play ${state} preview` })).toBeVisible();
    }
    const idle = settings.locator('[data-state-section=idle]');
    await idle.getByLabel('Frame width', { exact: true }).fill('32');
    await expect(idle.getByLabel('Frame count', { exact: true })).toHaveValue('6');
    await idle.getByLabel('Frame width', { exact: true }).fill('64');
    await expect(idle.getByLabel('Frame count', { exact: true })).toHaveValue('3');
    await idle.getByLabel('Frame count', { exact: true }).fill('512');
    await expect(idle.getByLabel('Frame count', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      await settings.evaluate(async () => {
        const cfg = await window.companion.getConfig();
        return cfg.ok && cfg.value.sprite.idle.frameCount;
      }),
    ).toBe(3);
    await idle.getByLabel('Frame count', { exact: true }).fill('3');
    await expect(idle.getByLabel('Frame count', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await settings.screenshot({ path: info.outputPath('sprites-sheet.png') });
    await app.evaluate(({ dialog }, file) => {
      (
        dialog as unknown as {
          showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
        }
      ).showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, packFile);
    await settings.getByRole('button', { name: 'Export Sprite Pack', exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return readSpritePack(await readFile(packFile)).manifest.sprite.idle.frameCount;
        } catch {
          return 0;
        }
      })
      .toBe(3);
    await idle.getByRole('button', { name: 'Reset to Default Sprite', exact: true }).click();
    await expect(idle.getByLabel('Idle source type')).toHaveValue('static');
    await app.evaluate(({ dialog }, file) => {
      (
        dialog as unknown as {
          showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
        }
      ).showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      (
        dialog as unknown as { showMessageBox: () => Promise<{ response: number }> }
      ).showMessageBox = async () => ({ response: 0 });
    }, packFile);
    await settings.getByRole('button', { name: 'Import Sprite Pack', exact: true }).click();
    await expect(idle.getByLabel('Idle source type')).toHaveValue('static');
    await app.evaluate(({ dialog }) => {
      (
        dialog as unknown as { showMessageBox: () => Promise<{ response: number }> }
      ).showMessageBox = async () => ({ response: 1 });
    });
    await settings.getByRole('button', { name: 'Import Sprite Pack', exact: true }).click();
    await expect(idle.getByLabel('Idle source type')).toHaveValue('sheet');
    await expect(idle.getByLabel('Frame count', { exact: true })).toHaveValue('3');
    const bogus = join(directory, 'fake.png');
    await writeFile(bogus, 'pretend png');
    await idle.getByLabel('Idle sprite files').setInputFiles(bogus);
    await expect(idle.getByRole('alert')).toContainText('contents');
    expect(
      await settings.evaluate(async () => {
        const cfg = await window.companion.getConfig();
        return cfg.ok && cfg.value.sprite.idle.frameCount;
      }),
    ).toBe(3);
    await rm(source);
    await app.close();
    app = await _electron.launch({
      args: ['out/main/index.js'],
      env: launchEnvironment(directory),
    });
    pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    const assets = await pet.evaluate(() => window.companion.getSpriteAssets());
    if (!assets.ok) throw new Error(assets.error.userMessage);
    for (const state of ['idle', 'thinking', 'speaking'] as const) {
      expect(assets.value[state].frames).toHaveLength(3);
      expect(assets.value[state].width).toBe(64);
    }
    await expect
      .poll(() =>
        pet.getByTestId('sprite').evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBe(64);
    // Folder import uses a main-owned native picker and natural sequence sorting.
    const folder = join(directory, 'sequence');
    await mkdir(folder);
    for (const name of ['frame10.png', 'frame2.png'])
      await sharp({ create: { width: 24, height: 24, channels: 4, background: 'green' } })
        .png()
        .toFile(join(folder, name));
    await pet.evaluate(() => window.companion.openSettings('Sprites'));
    await expect.poll(() => app.windows().length).toBe(2);
    const next = app.windows().find((page) => page !== pet);
    if (!next) throw new Error('Settings did not reopen');
    await next.getByLabel('Idle source type').selectOption('frames');
    await app.evaluate(({ dialog }, folder) => {
      (
        dialog as unknown as {
          showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
        }
      ).showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      (
        dialog as unknown as { showMessageBox: () => Promise<{ response: number }> }
      ).showMessageBox = async () => ({ response: 1 });
    }, folder);
    await next
      .locator('[data-state-section=idle]')
      .getByRole('button', { name: 'Browse…', exact: true })
      .click();
    await expect(next.getByText('2 frames detected', { exact: true })).toBeVisible();
    const mouth = join(directory, 'mouth.png');
    await sharp({ create: { width: 72, height: 24, channels: 4, background: 'orange' } })
      .png()
      .toFile(mouth);
    await next.getByRole('switch', { name: 'Enable mouth frames', exact: true }).click();
    await next.getByLabel('Mouth sprite files').setInputFiles(mouth);
    await expect(next.getByLabel('Mouth frame scrubber')).toHaveAttribute('max', '2');
    await next.getByLabel('Driven by', { exact: true }).selectOption('text-rate');
    await next.getByRole('button', { name: 'Test Mouth Sync', exact: true }).click();
    await expect(next.getByRole('button', { name: 'Stop Test', exact: true })).toBeVisible();
    await expect.poll(() => next.getByLabel('Mouth frame scrubber').inputValue()).not.toBe('0');
    await expect(next.getByRole('button', { name: 'Test Mouth Sync', exact: true })).toBeVisible({
      timeout: 5000,
    });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
