import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { defaults } from '../../src/shared/config';
import { launchEnvironment } from './environment';
test('sheet playback advances and hidden window suspends animation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-animation-'));
  await mkdir(join(directory, 'sprites', 'idle'), { recursive: true });
  await sharp({ create: { width: 384, height: 128, channels: 4, background: '#abcdef' } })
    .png()
    .toFile(join(directory, 'sprites', 'idle', 'sheet.png'));
  const cfg = defaults();
  cfg.sprite.idle = {
    ...cfg.sprite.idle,
    mode: 'sheet',
    source: 'sheet.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 3,
    fps: 10,
  };
  await writeFile(join(directory, 'config.json'), JSON.stringify(cfg));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const window = await app.firstWindow();
    const canvas = window.getByTestId('sprite');
    await expect(canvas).toHaveAttribute('data-frame', '0');
    await expect(canvas).toHaveAttribute('data-frame', '1');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
    await expect(canvas).toHaveAttribute('data-running', 'false');
    const before = await canvas.getAttribute('data-frame');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(await canvas.getAttribute('data-frame')).toBe(before);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.showInactive());
    await expect(canvas).toHaveAttribute('data-frame', '1');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
