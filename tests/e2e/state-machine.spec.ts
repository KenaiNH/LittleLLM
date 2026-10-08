import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { defaults } from '../../src/shared/config';
import { launchEnvironment } from './environment';

test('state lifecycle holds frames, blends alpha, aligns anchors, pauses dwell and cancels', async () => {
  test.setTimeout(60000);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-states-'));
  const image = async (state: string, width: number, height: number, body: string) => {
    const path = join(directory, 'sprites', state);
    await mkdir(path, { recursive: true });
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
      ),
    )
      .png()
      .toFile(join(path, 'fixture.png'));
  };
  await image('idle', 128, 128, '<rect x="16" y="16" width="96" height="96" fill="red"/>');
  await image(
    'thinking',
    256,
    128,
    '<rect x="16" y="16" width="96" height="96" fill="blue"/><rect x="144" y="16" width="96" height="96" fill="blue"/>',
  );
  await image('speaking', 192, 96, '<rect x="16" y="16" width="160" height="64" fill="lime"/>');
  const config = defaults();
  config.sprite.idle.source = 'fixture.png';
  config.sprite.thinking = {
    ...config.sprite.thinking,
    source: 'fixture.png',
    mode: 'sheet',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 2,
    fps: 10,
    playbackMode: 'once-idle',
  };
  config.sprite.speaking.source = 'fixture.png';
  config.sprite.crossfadeMs = 500;
  config.sprite.minThinkingMs = 2000;
  config.bubble.textReveal = 'instant';
  config.bubble.dwellMs = 10000;
  config.window.snapToEdges = false;
  config.llm = { ...config.llm, provider: 'mock', model: 'short', mockReplySpeed: 500 };
  // Mock provider explicitly requires Developer Mode; no production endpoint is simulated.
  await writeFile(join(directory, 'config.json'), JSON.stringify(config));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  let closed = false;
  try {
    const pet = await app.firstWindow(),
      sprite = pet.getByTestId('sprite'),
      bubble = pet.getByTestId('bubble');
    await expect(sprite).toHaveAttribute('data-fade', '1');
    await app.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      BrowserWindow.getAllWindows()[0]?.setPosition(area.x + 300, area.y + 400);
    });
    expect((await pet.evaluate(() => window.companion.overrideState('speaking'))).ok).toBe(false);
    await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (!cfg.ok) throw new Error('No config');
      await window.companion.setConfig('advanced', { ...cfg.value.advanced, developerMode: true });
    });
    const anchor = () =>
      pet.evaluate(async () => {
        const result = await window.companion.getPetViewport();
        if (!result.ok) throw new Error('No viewport');
        const v = result.value;
        return {
          x: v.window.x + v.sprite.x + v.sprite.width / 2,
          y: v.window.y + v.sprite.y + v.sprite.height,
        };
      });
    const initialAnchor = await anchor();
    await pet.evaluate(() => {
      const samples: { state: string; fade: number; pixel: number[] }[] = [];
      Object.assign(window, { fadeSamples: samples });
      const start = performance.now();
      const capture = () => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sprite"]');
        if (canvas)
          samples.push({
            state: canvas.dataset.state ?? '',
            fade: Number(canvas.dataset.fade),
            pixel: Array.from(
              canvas
                .getContext('2d')
                ?.getImageData(canvas.width / 2, canvas.height - 64 * window.devicePixelRatio, 1, 1)
                .data ?? [],
            ),
          });
        if (performance.now() - start < 3000) requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
      return window.companion.chat('Hello');
    });
    await expect(sprite).toHaveAttribute('data-state', 'thinking');
    await expect(sprite).toHaveAttribute('data-frame', '1');
    await expect(bubble).toHaveAttribute('data-streaming', 'false');
    expect(await sprite.getAttribute('data-state')).toBe('thinking');
    await pet.evaluate(() => window.companion.hoverBubble(true));
    await expect(sprite).toHaveAttribute('data-state', 'speaking');
    await expect(sprite).toHaveAttribute('data-fade', '1');
    await expect
      .poll(() =>
        sprite.evaluate((node) => ({
          width: (node as HTMLCanvasElement).width / window.devicePixelRatio,
          height: (node as HTMLCanvasElement).height / window.devicePixelRatio,
        })),
      )
      .toEqual({ width: 192, height: 96 });
    expect(await anchor()).toEqual(initialAnchor);
    const samples = await pet.evaluate(
      () =>
        (window as unknown as { fadeSamples: { state: string; fade: number; pixel: number[] }[] })
          .fadeSamples,
    );
    const mid = samples.filter(
      (sample) => sample.state === 'thinking' && sample.fade > 0.2 && sample.fade < 0.8,
    );
    expect(mid.length).toBeGreaterThanOrEqual(1);
    for (const sample of mid) {
      expect(sample.pixel[3]).toBe(255);
      expect(sample.pixel[0]).toBeGreaterThan(20);
      expect(sample.pixel[2]).toBeGreaterThan(20);
    }
    await pet.screenshot({ path: 'docs/design/phase9-speaking.png' });
    await new Promise((resolve) => setTimeout(resolve, 10500));
    expect(await sprite.getAttribute('data-state')).toBe('speaking');
    await expect(bubble).toBeVisible();
    await pet.evaluate(() => window.companion.hoverBubble(false));
    await expect(sprite).toHaveAttribute('data-state', 'idle', { timeout: 12000 });
    await expect(bubble).toHaveCount(0);
    await expect(sprite).toHaveAttribute('data-fade', '1');
    expect(await anchor()).toEqual(initialAnchor);
    await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (!cfg.ok) throw new Error('No config');
      await window.companion.setConfig('llm', { ...cfg.value.llm, model: 'never' });
      await window.companion.chat('Cancel before output');
      await window.companion.abortChat();
    });
    await expect(sprite).toHaveAttribute('data-state', 'idle');
    await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (!cfg.ok) throw new Error('No config');
      await window.companion.setConfig('llm', { ...cfg.value.llm, model: 'error' });
      await window.companion.chat('Show error');
    });
    await expect(bubble.getByRole('alert')).toBeVisible();
    await expect(sprite).toHaveAttribute('data-state', 'idle');
    await pet.evaluate(() => window.companion.dismissBubble());
    await expect(bubble).toHaveCount(0);
    await pet.evaluate(async () => {
      await window.companion.overrideState('listening');
      await window.companion.overrideState('auto');
    });
    await expect(sprite).toHaveAttribute('data-state', 'idle');
    // Stored position is the idle reference origin, including while another size is displayed.
    await expect
      .poll(async () => {
        const cfg = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
        return Object.values(cfg.window.positions).some(
          (p) =>
            JSON.stringify(p) ===
            JSON.stringify({ x: initialAnchor.x - 64, y: initialAnchor.y - 128 }),
        );
      })
      .toBe(true);
    await app.close();
    closed = true;
  } finally {
    if (!closed) await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
