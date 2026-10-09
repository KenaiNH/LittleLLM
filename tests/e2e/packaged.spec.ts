import { test, expect, _electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';

test('packaged x64 app renders bundled sprites and opens secure Settings', async () => {
  const executablePath = resolve('dist/win-unpacked/LittleLLM.exe');
  test.skip(!existsSync(executablePath), 'Build the x64 Windows package first.');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-packaged-'));
  const app = await _electron.launch({
    executablePath,
    args: [],
    env: { ...launchEnvironment(directory), ELECTRON_RENDERER_URL: 'http://127.0.0.1:9' },
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
    const installFolder = dirname(executablePath);
    for (const file of [
      'README.md',
      'LICENSE',
      'SPRITES.md',
      'PERSONA.md',
      'VOICE.md',
      'docs/release-checklist.md',
      'licenses/Inter.txt',
      'licenses/Courier-Prime.txt',
      'licenses/Cousine.txt',
    ])
      expect((await readFile(join(installFolder, file), 'utf8')).length).toBeGreaterThan(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('fresh packaged profile supports model setup, first reply and persisted settings after restart', async () => {
  test.setTimeout(60000);
  const executablePath = resolve('dist/win-unpacked/LittleLLM.exe');
  test.skip(!existsSync(executablePath), 'Build the x64 Windows package first.');
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'new-user-fixture' }] }));
      return;
    }
    let body = '';
    for await (const part of request) body += String(part);
    const payload = JSON.parse(body) as { stream: boolean };
    if (payload.stream) {
      response.setHeader('Content-Type', 'text/event-stream');
      response.end(
        'data: {"choices":[{"delta":{"content":"Your first packaged reply."}}]}\n\ndata: [DONE]\n\n',
      );
    } else {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: 'Connected.' } }] }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture missing');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-packaged-setup-'));
  const launch = () =>
    _electron.launch({
      executablePath,
      args: [],
      env: { ...launchEnvironment(directory), LITTLELLM_TEST_FIRST_RUN: '1' },
    });
  let app = await launch();
  try {
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page.url().includes('settings'));
    const pet = app.windows().find((page) => !page.url().includes('settings'));
    if (!settings || !pet) throw new Error('First-run windows missing');
    await expect(settings.getByRole('heading', { name: 'Model', exact: true })).toBeVisible();
    await settings.getByLabel('Base URL', { exact: true }).fill(baseUrl);
    await settings.getByLabel('Base URL', { exact: true }).press('Tab');
    await settings.getByLabel('Model', { exact: true }).fill('new-user-fixture');
    await settings.getByLabel('Model', { exact: true }).press('Tab');
    await settings.getByRole('button', { name: 'Test Connection', exact: true }).click();
    await expect(settings.getByRole('status', { name: 'Model connection' })).toContainText(
      'Connected',
    );
    await settings.close();
    await pet.getByTestId('sprite').click();
    await expect.poll(() => app.windows().length).toBe(2);
    const input = app.windows().find((page) => page.url().includes('view=input'));
    if (!input) throw new Error('Input missing');
    await input.getByRole('textbox', { name: 'Your response' }).fill('Hello from a new user');
    await input.getByRole('textbox', { name: 'Your response' }).press('Enter');
    await expect(pet.getByTestId('bubble')).toContainText('Your first packaged reply.');
    await app.close();
    app = await launch();
    const restartedPet = await app.firstWindow();
    await expect(restartedPet.getByTestId('sprite')).toBeVisible();
    expect(app.windows()).toHaveLength(1);
    expect(
      await restartedPet.evaluate(async () => {
        const result = await window.companion.getConfig();
        return result.ok
          ? { baseUrl: result.value.llm.baseUrl, model: result.value.llm.model }
          : null;
      }),
    ).toEqual({ baseUrl, model: 'new-user-fixture' });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
