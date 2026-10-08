import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
test('cached mask toggles native click-through and escape hatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-mask-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const page = await app.firstWindow();
    await page.getByTestId('sprite').waitFor();
    const masks = await page.evaluate(() => window.companion.getSpriteMasks());
    expect(masks.ok).toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error('No pet');
      const original = win.setIgnoreMouseEvents.bind(win);
      win.setIgnoreMouseEvents = (ignore, options) => {
        (win as unknown as { ignored: boolean }).ignored = ignore;
        original(ignore, options);
      };
    });
    await page.evaluate(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 0,
          clientY: 0,
          screenX: window.screenX,
          screenY: window.screenY,
          bubbles: true,
        }),
      ),
    );
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) =>
            (BrowserWindow.getAllWindows()[0] as unknown as { ignored: boolean }).ignored,
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 64,
          clientY: 65,
          screenX: window.screenX + 64,
          screenY: window.screenY + 65,
          bubbles: true,
        }),
      ),
    );
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) =>
            (BrowserWindow.getAllWindows()[0] as unknown as { ignored: boolean }).ignored,
        ),
      )
      .toBe(false);
    await page.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      if (cfg.ok)
        await window.companion.setConfig('advanced', {
          ...cfg.value.advanced,
          clickThrough: 'never',
        });
    });
    await page.evaluate(() => window.companion.setIgnoreMouse(true));
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) =>
            (BrowserWindow.getAllWindows()[0] as unknown as { ignored: boolean }).ignored,
        ),
      )
      .toBe(false);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
