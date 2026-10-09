import { test, expect, _electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';

test('packaged x64 app renders bundled sprites and opens secure Settings', async () => {
  const executablePath = resolve('dist/win-unpacked/LittleLLM.exe');
  test.skip(!existsSync(executablePath), 'Build the x64 Windows package first.');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-packaged-'));
  const app = await _electron.launch({
    executablePath,
    args: [],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await expect(pet.getByTestId('sprite')).toBeVisible();
    await expect
      .poll(() =>
        pet.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sprite"]');
          return Boolean(
            canvas
              ?.getContext('2d')
              ?.getImageData(0, 0, canvas.width, canvas.height)
              .data.some((value, index) => index % 4 === 3 && value > 0),
          );
        }),
      )
      .toBe(true);
    expect(
      await pet.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    expect((await pet.evaluate(() => window.companion.getRuntime())).ok).toBe(true);
    await pet.evaluate(() => window.companion.openSettings('Advanced'));
    const settings = await app.waitForEvent('window');
    await expect(settings.getByRole('button', { name: 'Advanced', exact: true })).toBeVisible();
    expect((await settings.evaluate(() => window.companion.getConfig())).ok).toBe(true);
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
