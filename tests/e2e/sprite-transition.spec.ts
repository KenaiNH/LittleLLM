import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { defaults } from '../../src/shared/config';
import { launchEnvironment } from './environment';

test('transparent crossfades pause while hidden and custom sprite anchors survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-crossfade-'));
  for (const [state, width, height, color] of [
    ['idle', 96, 64, '#ff000080'],
    ['thinking', 128, 96, '#0000ff80'],
    ['speaking', 96, 64, '#00ff0080'],
  ] as const) {
    await mkdir(join(directory, 'sprites', state), { recursive: true });
    await sharp({ create: { width, height, channels: 4, background: color } })
      .png()
      .toFile(join(directory, 'sprites', state, 'fixture.png'));
  }
  const cfg = defaults();
  cfg.advanced.developerMode = true;
  cfg.window.snapToEdges = false;
  cfg.sprite.flipHorizontal = true;
  cfg.sprite.crossfadeMs = 500;
  cfg.sprite.idle = { ...cfg.sprite.idle, source: 'fixture.png', anchor: { x: 0.25, y: 0.5 } };
  cfg.sprite.thinking = {
    ...cfg.sprite.thinking,
    source: 'fixture.png',
    anchor: { x: 0.75, y: 0.75 },
  };
  cfg.sprite.speaking.source = 'fixture.png';
  await writeFile(join(directory, 'config.json'), JSON.stringify(cfg));
  let app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow(),
      sprite = pet.getByTestId('sprite');
    await expect(sprite).toHaveAttribute('data-fade', '1');
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setPosition(300, 300);
      win?.show();
      win?.focus();
    });
    // Sample common pixels relative to the shared anchor, rather than frame centers.
    await pet.evaluate(() => {
      const samples: { fade: number; rgba: number[] }[] = [];
      Object.assign(window, { blendSamples: samples });
      const start = performance.now();
      const capture = () => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sprite"]');
        if (canvas?.dataset.state === 'thinking') {
          const ratio = window.devicePixelRatio;
          samples.push({
            fade: Number(canvas.dataset.fade),
            rgba: Array.from(
              canvas.getContext('2d')?.getImageData(62 * ratio, 62 * ratio, 1, 1).data ?? [],
            ),
          });
        }
        if (performance.now() - start < 800) requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
      return window.companion.overrideState('thinking');
    });
    await expect(sprite).toHaveAttribute('data-fade', '1');
    const samples = await pet.evaluate(
      () =>
        (window as unknown as { blendSamples: { fade: number; rgba: number[] }[] }).blendSamples,
    );
    const mid = samples.filter((value) => value.fade > 0.2 && value.fade < 0.8);
    expect(mid.length).toBeGreaterThan(0);
    for (const sample of mid) expect(sample.rgba[3]).toBeGreaterThanOrEqual(127);
    for (const sample of mid) expect(sample.rgba[3]).toBeLessThanOrEqual(129);
    await pet.evaluate(() => window.companion.overrideState('speaking'));
    await expect(sprite).toHaveAttribute('data-state', 'speaking');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
    await expect(sprite).toHaveAttribute('data-running', 'false');
    const before = await sprite.getAttribute('data-fade');
    expect(Number(before)).toBeLessThan(1);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await sprite.getAttribute('data-fade')).toBe(before);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
    await expect(sprite).toHaveAttribute('data-fade', '1');
    await expect
      .poll(async () => {
        const config = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
        return Object.values(config.window.positions).some(
          (value) => JSON.stringify(value) === JSON.stringify({ x: 300, y: 300 }),
        );
      })
      .toBe(true);
    await app.close();
    app = await _electron.launch({
      args: ['out/main/index.js'],
      env: launchEnvironment(directory),
    });
    const reopened = await app.firstWindow();
    await expect(reopened.getByTestId('sprite')).toHaveAttribute('data-fade', '1');
    expect(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getPosition()),
    ).toEqual([300, 300]);
    expect(
      await reopened
        .getByTestId('sprite')
        .evaluate((node) => node.getBoundingClientRect().toJSON()),
    ).toMatchObject({ width: 96, height: 64 });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
