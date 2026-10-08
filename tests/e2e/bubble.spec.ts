import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
import sharp from 'sharp';
import { configureMock } from './mock';
// eslint-disable-next-line no-empty-pattern
test('Markdown bubble caps, scrolls, sanitizes and scales', async ({}, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-bubble-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  const markdown =
    '**Bold** and *italic*\n\n```ts\nconst longLine = "' +
    'x'.repeat(180) +
    '";\n```\n\n<script>document.body.dataset.pwned="yes"</script><img src="invalid" onerror="document.body.dataset.pwned=1">\n\n' +
    Array.from(
      { length: 80 },
      (_, i) => `Paragraph ${i} with enough words to test vertical scrolling.`,
    ).join('\n\n');
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await configureMock(pet);
    await app.evaluate(async ({ clipboard }) => {
      (clipboard as unknown as { testBackup: string }).testBackup = await clipboard.readText();
    });
    await pet.evaluate(async (text) => {
      const cfg = await window.companion.getConfig();
      if (cfg.ok)
        await window.companion.setConfig('bubble', {
          ...cfg.value.bubble,
          textReveal: 'instant',
          maxHeightPx: 240,
        });
      await window.companion.submitInput(text);
    }, markdown);
    const bubble = pet.getByTestId('bubble'),
      content = pet.getByTestId('bubble-content');
    await expect(bubble.locator('strong')).toHaveText('Bold');
    expect(await bubble.locator('script').count()).toBe(0);
    expect(await bubble.locator('[onerror]').count()).toBe(0);
    expect(await pet.evaluate(() => document.body.dataset.pwned)).toBeUndefined();
    const snapshot = await sharp(await bubble.screenshot({ omitBackground: true }))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      pixel = (20 * snapshot.info.width + 20) * 4;
    expect((snapshot.data[pixel + 2] ?? 0) - (snapshot.data[pixel] ?? 0)).toBeGreaterThan(30);
    await expect.poll(() => content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect
      .poll(() => content.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThanOrEqual(24);
    await content.evaluate((el) => (el.scrollTop = 0));
    await expect(bubble).toHaveAttribute('data-autoscroll', 'suspended');
    await expect(bubble.getByRole('button', { name: '↓ New messages' })).toBeVisible();
    expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
    await bubble.getByRole('button', { name: '↓ New messages' }).click();
    await expect
      .poll(() => content.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThanOrEqual(24);
    await content.evaluate((el) => (el.scrollTop = 0));
    await bubble.getByRole('button', { name: 'Copy code' }).click();
    await expect
      .poll(() =>
        app.evaluate(async ({ clipboard }) =>
          (await clipboard.readText()).startsWith('const longLine'),
        ),
      )
      .toBe(true);
    await expect(bubble).toHaveAttribute('data-streaming', 'false', { timeout: 10000 });
    for (const scale of [0.5, 1, 2.5]) {
      await pet.evaluate(async (value) => {
        const cfg = await window.companion.getConfig();
        if (cfg.ok)
          await window.companion.setConfig('bubble', { ...cfg.value.bubble, scale: value });
      }, scale);
      await expect
        .poll(() => bubble.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
        .toBe(22 * scale);
      await expect
        .poll(() =>
          pet.evaluate(async () => {
            const result = await window.companion.getPetViewport();
            if (!result.ok) return false;
            const view = result.value;
            return (
              view.window.x >= view.workArea.x &&
              view.window.y >= view.workArea.y &&
              view.window.x + view.window.width <= view.workArea.x + view.workArea.width &&
              view.window.y + view.window.height <= view.workArea.y + view.workArea.height
            );
          }),
        )
        .toBe(true);
      await pet.screenshot({ path: info.outputPath(`bubble-${scale}.png`) });
    }
  } finally {
    await app.evaluate(async ({ clipboard }) => {
      await clipboard.writeText((clipboard as unknown as { testBackup: string }).testBackup ?? '');
    });
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('wheel pass-through delivers a wheel message behind the bubble', async () => {
  test.skip(process.platform !== 'win32', 'Windows native wheel forwarding');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-wheel-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await configureMock(pet);
    await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (cfg.ok) {
        await window.companion.setConfig('advanced', {
          ...cfg.value.advanced,
          clickThrough: 'never',
        });
        await window.companion.setConfig('bubble', {
          ...cfg.value.bubble,
          textReveal: 'instant',
          wheelBehavior: 'passthrough',
        });
      }
      await window.companion.submitInput('Wheel forwarding test.');
    });
    await pet.getByTestId('bubble').waitFor();
    await app.evaluate(async ({ BrowserWindow, screen }) => {
      const pet = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('view=pet'),
      );
      if (!pet) throw new Error('Missing pet');
      const bounds = screen.getDisplayMatching(pet.getBounds()).workArea;
      const behind = new BrowserWindow({
        ...bounds,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await behind.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<body style="margin:0;height:3000px;background:white"><script>window.wheels=0;window.addEventListener("wheel",()=>window.wheels++);</script>',
          ),
      );
      behind.show();
      pet.setAlwaysOnTop(true, 'screen-saver');
      pet.showInactive();
    });
    const dip = await pet.getByTestId('bubble-content').evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return { x: window.screenX + bounds.x + 30, y: window.screenY + bounds.y + 10 };
    });
    const point = await app.evaluate(({ screen }, dip) => screen.dipToScreenPoint(dip), dip);
    await pet.evaluate(() =>
      document.addEventListener(
        'wheel',
        () => (document.body.dataset.wheel = String(Number(document.body.dataset.wheel ?? 0) + 1)),
        { capture: true },
      ),
    );
    await promisify(execFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('src/main/platform/win32/testPointer.ps1'),
        '-X',
        String(point.x),
        '-Y',
        String(point.y),
        '-WheelDelta',
        '-120',
      ],
      { windowsHide: true },
    );
    await expect.poll(() => pet.evaluate(() => document.body.dataset.wheel)).toBe('1');
    await expect
      .poll(() =>
        app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith('data:'),
          );
          return win?.webContents.executeJavaScript('window.wheels') as Promise<number>;
        }),
      )
      .toBe(1);
    await expect
      .poll(() =>
        app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith('data:'),
          );
          return win?.webContents.executeJavaScript('window.scrollY') as Promise<number>;
        }),
      )
      .toBeGreaterThan(0);
    await pet.getByRole('button', { name: 'Dismiss dialogue' }).click();
    await expect(pet.getByTestId('bubble')).toHaveCount(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
