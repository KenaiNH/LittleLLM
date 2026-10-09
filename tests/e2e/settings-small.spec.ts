import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';

test('Settings fits a small work area and keeps panels, reset and restart controls reachable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-small-settings-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await expect(pet.getByTestId('sprite')).toBeVisible();
    // Simulate a scaled laptop's logical work area without changing host displays.
    await app.evaluate(({ screen }) => {
      const original = screen.getDisplayNearestPoint.bind(screen);
      screen.getDisplayNearestPoint = (point) => ({
        ...original(point),
        workArea: { x: 0, y: 0, width: 800, height: 480 },
      });
    });
    await pet.evaluate(() => window.companion.openSettings('General'));
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings missing');
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('settings'))
        ?.getBounds(),
    );
    if (!bounds) throw new Error('Settings bounds missing');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(800);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(480);
    await settings.keyboard.press('Control+8');
    await expect(settings.getByRole('heading', { name: 'Advanced', exact: true })).toBeVisible();
    await settings.getByRole('button', { name: 'Advanced', exact: true }).scrollIntoViewIfNeeded();
    await settings.getByRole('switch', { name: 'Hardware acceleration', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Restart Now' })).toBeInViewport();
    await settings
      .getByRole('button', { name: 'Reset this panel to defaults' })
      .scrollIntoViewIfNeeded();
    await expect(
      settings.getByRole('button', { name: 'Reset this panel to defaults' }),
    ).toBeInViewport();
    await settings.keyboard.press('Control+1');
    await expect(settings.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await settings.keyboard.press('Control+f');
    await expect(settings.getByRole('textbox', { name: /Search/ })).toBeFocused();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
