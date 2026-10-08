import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchEnvironment } from './environment';
import { configureMock } from './mock';
// eslint-disable-next-line no-empty-pattern
test('Settings live apply, validation, encrypted keys, explicit verification and confirmed resets', async ({}, info) => {
  test.setTimeout(90000);
  const requests: {
    url: string;
    authorization: string | undefined;
    body: Record<string, unknown>;
  }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
      : {};
    requests.push({ url: request.url ?? '', authorization: request.headers.authorization, body });
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify(
        request.url?.endsWith('/models')
          ? { data: [{ id: 'fixture-model' }, { id: 'another-model' }] }
          : { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-settings-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await configureMock(pet);
    await pet.evaluate(async () => {
      const result = await window.companion.getConfig();
      if (!result.ok) throw new Error('config');
      await window.companion.setConfig('bubble', { ...result.value.bubble, dwellMs: 0 });
      await window.companion.submitInput('Live appearance preview');
      await window.companion.openSettings('General');
    });
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings window did not open');
    settings.on('pageerror', (error) => console.error('Settings renderer error:', error.message));
    await expect(settings.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await expect(
      settings.getByRole('switch', { name: 'Start minimized (sprite hidden)' }),
    ).toBeDisabled();
    await settings.getByRole('switch', { name: 'Hide sprite from screen capture' }).click();
    await expect(settings.getByText('Some changes need a restart.')).toBeVisible();
    await settings.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(settings.getByText('Some changes need a restart.')).toHaveCount(0);
    await settings.getByLabel('Search settings').fill('region');
    await expect(
      settings.getByText('Capture screen region and attach', { exact: true }),
    ).toHaveCount(0);
    await settings.getByLabel('Search settings').fill('');
    await settings.getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(
      settings.getByRole('heading', { name: 'Live preview', exact: true }),
    ).toBeAttached();
    const bubble = pet.getByTestId('bubble');
    await expect(bubble).toBeAttached();
    for (const percent of [50, 100, 250]) {
      await settings
        .getByRole('spinbutton', { name: 'Bubble scale', exact: true })
        .fill(String(percent));
      await expect
        .poll(() => bubble.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)))
        .toBe((22 * percent) / 100);
    }
    await settings.getByRole('spinbutton', { name: 'Bubble scale', exact: true }).fill('100');
    await settings.getByLabel('Scale is relative to', { exact: true }).selectOption('screen');
    await expect(settings.getByLabel('Max width (% of screen) slider')).toBeAttached();
    await expect(settings.getByLabel('Maximum width', { exact: true })).toHaveCount(0);
    await settings.getByLabel('Font', { exact: true }).fill('MissingAcceptanceFontFamily');
    await settings.getByLabel('Font', { exact: true }).press('Tab');
    await expect(settings.getByLabel('Font', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await settings.getByLabel('Font', { exact: true }).fill('Courier Prime');
    await settings.getByLabel('Font', { exact: true }).press('Tab');
    await expect(settings.getByLabel('Font', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await settings.getByLabel('Theme', { exact: true }).selectOption('light');
    await expect(settings.getByLabel('Background color', { exact: true })).toHaveCount(0);
    await settings.getByRole('button', { name: /^Model/ }).click();
    await settings.getByLabel('Provider', { exact: true }).selectOption('openai-compatible');
    const endpoint = settings.getByLabel('Base URL', { exact: true });
    await endpoint.fill('invalid endpoint');
    await endpoint.press('Tab');
    await expect(endpoint).toHaveAttribute('aria-invalid', 'true');
    expect(
      await settings.evaluate(async () => {
        const result = await window.companion.getConfig();
        return result.ok && result.value.llm.baseUrl;
      }),
    ).not.toBe('invalid endpoint');
    await settings.getByRole('button', { name: 'General', exact: true }).click();
    await settings.getByRole('button', { name: /^Model/ }).click();
    await expect(endpoint).toHaveValue('invalid endpoint');
    await endpoint.fill(baseUrl);
    await endpoint.press('Tab');
    await expect(endpoint).toHaveAttribute('aria-invalid', 'false');
    await expect(settings.getByLabel('API key', { exact: true })).toHaveAttribute(
      'placeholder',
      'Usually not required for local models',
    );
    await settings.getByLabel('Model', { exact: true }).fill('fixture-model');
    await settings.getByLabel('Model', { exact: true }).press('Tab');
    await settings.getByLabel('API key', { exact: true }).fill('fixture-test-key-9087');
    await settings.getByLabel('API key', { exact: true }).press('Tab');
    await expect(settings.getByLabel('API key', { exact: true })).toHaveAttribute(
      'placeholder',
      '••••••••9087',
    );
    const encrypted = await readFile(join(directory, 'secrets.json'), 'utf8');
    expect(encrypted).not.toContain('fixture-test-key-9087');
    expect(await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable())).toBe(true);
    expect(
      await settings.evaluate(async () =>
        window.companion.getSecretStatus('llm.openai-compatible'),
      ),
    ).toMatchObject({ ok: true, value: { has: true, last4: '9087' } });
    await settings.getByRole('button', { name: 'Refresh models', exact: true }).click();
    await expect(settings.getByText('2 models available', { exact: true })).toBeVisible();
    await expect(settings.locator('[data-verified=true]')).toHaveCount(0);
    await settings.getByRole('button', { name: 'Test Connection', exact: true }).click();
    await expect(settings.getByRole('status', { name: 'Model connection' })).toHaveText(
      'Connected — 2 models found',
    );
    await expect(settings.locator('[data-verified=true]')).toHaveCount(2);
    expect(requests.find((request) => request.url.endsWith('/chat/completions'))).toMatchObject({
      authorization: 'Bearer fixture-test-key-9087',
      body: { model: 'fixture-model', max_tokens: 1, stream: false },
    });
    await settings.getByLabel('API key', { exact: true }).fill('replacement-key-1234');
    await settings.getByLabel('API key', { exact: true }).press('Tab');
    await expect(settings.locator('[data-verified=true]')).toHaveCount(0);
    await settings.getByLabel('Context to send', { exact: true }).selectOption('token-budget');
    await expect(settings.getByLabel('Token budget', { exact: true })).toBeVisible();
    const tags = settings.getByLabel('Stop sequences', { exact: true });
    for (const value of ['a', 'b', 'c', 'd']) {
      await tags.fill(value);
      await tags.press('Enter');
      await expect(tags).toHaveValue('');
    }
    await tags.fill('fifth');
    await tags.press('Enter');
    await expect(tags).toHaveValue('fifth');
    await expect(tags).toHaveAttribute('aria-invalid', 'true');
    await settings
      .getByLabel('System prompt', { exact: true })
      .fill('Custom prompt for the acceptance test');
    await settings.getByLabel('System prompt', { exact: true }).press('Tab');
    await expect(settings.getByLabel('Prompt preset', { exact: true })).toHaveValue('custom');
    await settings.getByLabel('Prompt preset', { exact: true }).selectOption('helpful-companion');
    await expect
      .poll(() => settings.getByLabel('System prompt', { exact: true }).inputValue())
      .toContain('desktop companion');
    await settings.screenshot({ path: info.outputPath('model-light.png') });
    await settings.getByRole('switch', { name: 'Dark mode', exact: true }).click();
    await expect(settings.getByTestId('settings')).toHaveAttribute('data-dark', 'true');
    await settings.screenshot({ path: info.outputPath('model-dark.png') });
    await endpoint.fill('bad reset draft');
    await endpoint.press('Tab');
    await app.evaluate(({ dialog }) => {
      (
        dialog as unknown as { showMessageBox: () => Promise<{ response: number }> }
      ).showMessageBox = async () => ({ response: 0 });
    });
    await settings.getByRole('button', { name: 'Reset this panel to defaults' }).click();
    await expect(endpoint).toHaveValue('bad reset draft');
    await app.evaluate(({ dialog }) => {
      (
        dialog as unknown as { showMessageBox: () => Promise<{ response: number }> }
      ).showMessageBox = async () => ({ response: 1 });
    });
    await settings.getByRole('button', { name: 'Reset this panel to defaults' }).click();
    await expect(endpoint).toHaveValue('https://api.openai.com/v1');
    await expect(endpoint).toHaveAttribute('aria-invalid', 'false');
    expect(
      await settings.evaluate(async () =>
        window.companion.getSecretStatus('llm.openai-compatible'),
      ),
    ).toMatchObject({ ok: true, value: { has: false } });
    await pet.evaluate(() => window.companion.openSettings('Appearance'));
    await expect(settings.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
    expect(app.windows()).toHaveLength(2);
    await settings.close();
    await expect.poll(() => app.windows().length).toBe(1);
    await expect(pet.getByTestId('sprite')).toBeAttached();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
