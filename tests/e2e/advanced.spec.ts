import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configSchema } from '../../src/shared/config';
import { launchEnvironment } from './environment';
// eslint-disable-next-line no-empty-pattern
test('Advanced controls, secure diagnostics, session debug and native registration', async ({}, info) => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-advanced-'));
  await writeFile(
    join(directory, 'config.json'),
    JSON.stringify(
      configSchema.parse({
        advanced: { developerMode: true },
        window: { fullscreenBehavior: 'never' },
      }),
    ),
  );
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    expect(
      await pet.evaluate(() => window.companion.diagnostics({ action: 'clear-keys' })),
    ).toMatchObject({ ok: false });
    await pet.evaluate(() => window.companion.openSettings('Advanced'));
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings missing');
    await expect(settings.getByRole('heading', { name: 'Advanced', exact: true })).toBeVisible();
    await settings.getByLabel('Click-through mode').selectOption('bounding-box');
    await expect(settings.locator('[data-control="157"]')).toHaveCount(0);
    await settings.getByLabel('Click-through mode').selectOption('alpha-mask');
    await settings.getByLabel('Hit-test sample rate').selectOption('4');
    await settings.getByLabel('Animation frame rate cap').selectOption('30');
    await settings.getByLabel('Sprite cache size').selectOption('64');
    await settings.getByRole('switch', { name: 'Allow dragging the sprite' }).click();
    await expect(settings.locator('[data-control="160"]')).toHaveCount(0);
    await settings.getByRole('switch', { name: 'Hardware acceleration', exact: true }).click();
    await expect(settings.getByText('Some changes need a restart.')).toBeVisible();
    await settings.getByRole('button', { name: 'Later', exact: true }).click();
    await settings.screenshot({ path: info.outputPath('advanced-light.png') });
    await settings.getByRole('switch', { name: 'Dark mode', exact: true }).click();
    await settings.screenshot({ path: info.outputPath('advanced-dark.png') });
    await settings.getByLabel('Force state').selectOption('thinking');
    await expect(pet.getByTestId('sprite')).toHaveAttribute('data-state', 'thinking');
    await settings.getByRole('switch', { name: 'Show hit-test mask overlay' }).click();
    await expect(pet.getByLabel('Hit-test mask overlay')).toBeAttached();
    await settings.getByRole('switch', { name: 'Show FPS and frame time' }).click();
    await expect(pet.getByLabel('Sprite FPS and frame time')).toBeAttached();
    const disk = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
    expect(disk.advanced).toMatchObject({
      fpsCap: '30',
      spriteCacheMb: 64,
      hitTestEveryNFrames: 4,
      hardwareAcceleration: false,
    });
    expect(JSON.stringify(disk)).not.toContain('forceState');
    expect(JSON.stringify(disk)).not.toContain('showMaskOverlay');
    await settings.getByRole('switch', { name: 'Developer mode', exact: true }).click();
    await expect(pet.getByLabel('Hit-test mask overlay')).toHaveCount(0);
    await expect(pet.getByTestId('sprite')).toHaveAttribute('data-state', 'idle');
    expect(
      await app.evaluate(({ globalShortcut }) => ({
        focus: globalShortcut.isRegistered('Control+Shift+Space'),
        region: globalShortcut.isRegistered('Control+Shift+S'),
        voice: globalShortcut.isRegistered('Control+Shift+V'),
      })),
    ).toEqual({ focus: true, region: false, voice: false });
    await settings.evaluate(() =>
      window.companion.setSecret('llm.openai-compatible', 'fixture-secret-9876'),
    );
    const exported = join(directory, 'export.json'),
      incoming = join(directory, 'incoming.json');
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.exported });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.incoming] });
      },
      { exported, incoming },
    );
    await settings.getByRole('button', { name: 'Export Settings…', exact: true }).click();
    await expect
      .poll(async () => readFile(exported, 'utf8').catch(() => ''))
      .toContain('schemaVersion');
    expect(await readFile(exported, 'utf8')).not.toContain('fixture-secret');
    await writeFile(incoming, JSON.stringify({ schemaVersion: 999 }));
    const future = await settings.evaluate(() =>
      window.companion.diagnostics({ action: 'import-settings' }),
    );
    expect(future).toMatchObject({
      ok: false,
      error: { userMessage: 'This settings file was created by a newer version of the app.' },
    });
    await writeFile(incoming, JSON.stringify({ advanced: { spriteCacheMb: 9 } }));
    expect(
      await settings.evaluate(() => window.companion.diagnostics({ action: 'import-settings' })),
    ).toMatchObject({ ok: false });
    const imported = configSchema.parse({
      advanced: { logLevel: 'debug', fpsCap: '15' },
      llm: { systemPrompt: 'Imported personal context' },
    });
    await writeFile(incoming, JSON.stringify(imported));
    expect(
      await settings.evaluate(() => window.companion.diagnostics({ action: 'import-settings' })),
    ).toMatchObject({ ok: true });
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')).llm.systemPrompt,
      )
      .toBe('Imported personal context');
    expect(
      (await readdir(directory)).filter((name) => name.startsWith('config.backup.')).length,
    ).toBeGreaterThan(0);
    expect(
      await settings.evaluate(() => window.companion.getSecretStatus('llm.openai-compatible')),
    ).toMatchObject({ ok: true, value: { has: true } });
    expect(
      await settings.evaluate(() =>
        window.companion.diagnostics({ action: 'reset-all', confirmation: 'no' }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await settings.evaluate(() =>
        window.companion.diagnostics({ action: 'reset-all', confirmation: 'RESET' }),
      ),
    ).toMatchObject({ ok: true });
    expect(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'))).toEqual(
      configSchema.parse({}),
    );
    expect(
      await settings.evaluate(() => window.companion.getSecretStatus('llm.openai-compatible')),
    ).toMatchObject({ ok: true, value: { has: true } });
    expect(
      await settings.evaluate(() => window.companion.diagnostics({ action: 'clear-keys' })),
    ).toMatchObject({ ok: true });
    expect(
      await settings.evaluate(() => window.companion.getSecretStatus('llm.openai-compatible')),
    ).toMatchObject({ ok: true, value: { has: false } });
    await settings.getByRole('button', { name: 'General', exact: true }).click();
    await expect(
      settings.getByRole('switch', { name: 'Show on all virtual desktops' }),
    ).toBeDisabled();
    await expect(settings.getByText(/Automatic pinning is deferred/)).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => !win.webContents.getURL().includes('settings'))
        ?.webContents.forcefullyCrashRenderer(),
    );
    await expect
      .poll(
        () =>
          app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find(
              (win) => !win.webContents.getURL().includes('settings'),
            );
            return win?.webContents.isCrashed() === false && !win.webContents.isLoading();
          }),
        { timeout: 15000 },
      )
      .toBe(true);
    // Playwright marks the original Page as crashed permanently. Verify the
    // recovered native webContents, including its renderer-to-main API.
    await expect
      .poll(() =>
        app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find(
            (win) => !win.webContents.getURL().includes('settings'),
          );
          if (!win) return false;
          try {
            return await win.webContents.executeJavaScript(
              'Boolean(document.querySelector("canvas[data-testid=sprite]")) && window.companion.getRuntime().then(result => result.ok)',
            );
          } catch {
            return false;
          }
        }),
      )
      .toBe(true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('first run opens Model with the inline onboarding controls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-first-run-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: { ...launchEnvironment(directory), LITTLELLM_TEST_FIRST_RUN: '1' },
  });
  try {
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page.url().includes('settings'));
    if (!settings) throw new Error('Settings missing');
    await expect(settings.getByRole('heading', { name: 'Model', exact: true })).toBeVisible();
    await expect(
      settings.getByText('Choose where your AI model runs to get started.'),
    ).toBeVisible();
    await settings.getByRole('button', { name: 'I have an API key' }).click();
    await expect(settings.locator('[data-control="62"] input')).toBeFocused();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
