import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launchEnvironment } from './environment';
const run = promisify(execFile);
test('transparent pixels deliver native button presses to the window behind', async () => {
  test.skip(process.platform !== 'win32', 'Requires a Windows interactive desktop');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-native-click-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const page = await app.firstWindow();
    await page.getByTestId('sprite').waitFor();
    const positions = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const pet = BrowserWindow.getAllWindows()[0];
      if (!pet) throw new Error('Missing pet');
      pet.setPosition(200, 200);
      const behind = new BrowserWindow({
        x: 180,
        y: 180,
        width: 200,
        height: 200,
        frame: false,
        alwaysOnTop: true,
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      await behind.loadURL(
        'data:text/html,<body style="margin:0;background:white;width:100vw;height:100vh"><script>window.clicks=0;document.addEventListener("mousedown",()=>window.clicks++);</script>',
      );
      behind.show();
      behind.focus();
      pet.showInactive();
      pet.setAlwaysOnTop(true, 'screen-saver');
      pet.moveTop();
      const factor = screen.getDisplayMatching(pet.getBounds()).scaleFactor;
      const handle = (win: Electron.BrowserWindow) => {
        const buffer = win.getNativeWindowHandle();
        return buffer.length === 8
          ? buffer.readBigUInt64LE().toString()
          : String(buffer.readUInt32LE());
      };
      return {
        x: Math.round(200 * factor),
        y: Math.round(200 * factor),
        factor,
        pet: handle(pet),
        behind: handle(behind),
      };
    });
    await page.evaluate(() => {
      document
        .querySelector('canvas')
        ?.addEventListener(
          'mousedown',
          () =>
            (document.body.dataset.clicks = String(Number(document.body.dataset.clicks ?? 0) + 1)),
        );
    });
    const pointer = async (x: number, y: number, click = false, target?: string) => {
      await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          resolve('src/main/platform/win32/testPointer.ps1'),
          '-X',
          String(x),
          '-Y',
          String(y),
          ...(click ? ['-Click'] : []),
          ...(target ? ['-ExpectedWindow', target] : []),
        ],
        { windowsHide: true },
      );
    };
    const behindClicks = () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('data:'),
        );
        if (!win) throw new Error('Missing backdrop');
        return win.webContents.executeJavaScript('window.clicks') as Promise<number>;
      });
    await pointer(
      Math.round(350 * positions.factor),
      Math.round(350 * positions.factor),
      true,
      positions.behind,
    );
    await expect.poll(behindClicks).toBe(1);
    await pointer(positions.x + 2, positions.y + 2);
    await page.waitForTimeout(150);
    await pointer(positions.x + 2, positions.y + 2, true, positions.behind);
    await expect.poll(behindClicks).toBe(2);
    const x = positions.x + Math.round(64 * positions.factor),
      y = positions.y + Math.round(65 * positions.factor);
    await pointer(x, y);
    await page.waitForTimeout(150);
    await pointer(x, y, true, positions.pet);
    await expect.poll(() => page.evaluate(() => document.body.dataset.clicks)).toBe('1');
    expect(await behindClicks()).toBe(2);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
