import { test, expect, _electron } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnvironment } from './environment';

test('Custom HTTP is configurable in Settings and plays binary, JSON base64, JSON URL and GET audio', async () => {
  test.setTimeout(90000);
  const requests: { path: string; method: string; key?: string; body: unknown }[] = [];
  const pcm = Buffer.alloc((24000 * 2) / 4);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 24000) * 1000), i * 2);
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += String(chunk);
    requests.push({
      path: request.url ?? '',
      method: request.method ?? '',
      key: request.headers.authorization,
      body: raw ? (JSON.parse(raw) as unknown) : null,
    });
    if (request.url?.startsWith('/base64'))
      response.end(JSON.stringify({ data: { audio: pcm.toString('base64') } }));
    else if (request.url?.startsWith('/url'))
      response.end(
        JSON.stringify({
          data: { audio: `http://127.0.0.1:${(server.address() as AddressInfo).port}/download` },
        }),
      );
    else {
      response.setHeader('Content-Type', 'audio/pcm');
      response.end(pcm);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-custom-voice-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await pet.evaluate(async () => {
      await window.companion.openSettings('Voice');
    });
    await expect.poll(async () => (await app.windows()).length).toBe(2);
    const settings = (await app.windows()).find((page) => page.url().includes('view=settings'));
    if (!settings) throw new Error('No Settings');
    await settings
      .getByRole('combobox', { name: 'Text-to-speech provider', exact: true })
      .selectOption('custom-http');
    const requestURL = settings.getByRole('textbox', { name: 'Request URL', exact: true });
    await requestURL.fill(base + '/binary');
    await requestURL.press('Tab');
    await settings
      .getByRole('combobox', { name: 'Audio format', exact: true })
      .selectOption('pcm16');
    await settings.getByRole('button', { name: 'Add header' }).click();
    await settings
      .getByRole('textbox', { name: 'Header name 1', exact: true })
      .fill('Authorization');
    await settings
      .getByRole('textbox', { name: 'Header value 1', exact: true })
      .fill('Bearer {{apiKey}}');
    await settings.getByRole('textbox', { name: 'Header value 1', exact: true }).press('Tab');
    await settings.locator('input[aria-label="API key"]').fill('custom-fixture-secret');
    await settings.locator('input[aria-label="API key"]').press('Tab');
    await expect(settings.getByRole('alert')).toHaveCount(0);
    const template = settings.getByRole('textbox', { name: 'Body template', exact: true });
    await template.fill('{invalid}');
    await template.press('Tab');
    await expect(settings.getByRole('alert')).toContainText('JSON object');
    await expect(settings.getByRole('button', { name: 'Test Voice', exact: true })).toBeDisabled();
    const preserved = await pet.evaluate(async () => {
      const cfg = await window.companion.getConfig();
      return cfg.ok && cfg.value.tts.custom.bodyTemplate;
    });
    expect(preserved).toBe('{"text":"{{text}}"}');
    await template.fill('{"text":"{{text}}","speed":{{speed}}}');
    await template.press('Tab');
    await expect(settings.getByRole('alert')).toHaveCount(0);
    await settings.screenshot({ path: test.info().outputPath('voice-custom-light.png') });
    const play = async () => {
      await settings.getByRole('button', { name: 'Test Voice', exact: true }).click();
      await expect(settings.getByRole('status', { name: 'Voice test' })).toContainText(
        'Played test phrase',
      );
    };
    await play();
    expect(requests[0]).toMatchObject({
      path: '/binary',
      method: 'POST',
      key: 'Bearer custom-fixture-secret',
      body: { text: 'Hello.', speed: 1 },
    });
    expect(requests.map((item) => (item.body as { text?: string } | null)?.text).join(' ')).toBe(
      "Hello. I'm your desktop companion.",
    );
    await settings
      .getByRole('combobox', { name: 'Response type', exact: true })
      .selectOption('json-base64');
    const jsonPath = settings.getByRole('textbox', { name: 'JSON field path', exact: true });
    await jsonPath.fill('data.audio');
    await jsonPath.press('Tab');
    await requestURL.fill(base + '/base64');
    await requestURL.press('Tab');
    await play();
    await settings
      .getByRole('combobox', { name: 'Response type', exact: true })
      .selectOption('json-url');
    await requestURL.fill(base + '/url');
    await requestURL.press('Tab');
    await play();
    expect(requests.find((item) => item.path === '/download')?.key).toBeUndefined();
    await settings
      .getByRole('combobox', { name: 'Response type', exact: true })
      .selectOption('binary');
    await expect(jsonPath).toHaveCount(0);
    await settings.getByRole('combobox', { name: 'HTTP method', exact: true }).selectOption('GET');
    await requestURL.fill(base + '/binary');
    await requestURL.press('Tab');
    await play();
    const getText = requests
      .filter((item) => item.method === 'GET' && item.path.startsWith('/binary'))
      .map((item) => new URL(base + item.path).searchParams.get('text'))
      .join(' ');
    expect(getText).toBe("Hello. I'm your desktop companion.");
    const cfg = await pet.evaluate(async () => window.companion.getConfig());
    expect(JSON.stringify(cfg)).not.toContain('custom-fixture-secret');
    expect(cfg.ok && cfg.value.tts.custom.headers).toEqual({ Authorization: 'Bearer {{apiKey}}' });
    await pet.evaluate(async () => {
      await window.companion.patchConfig('window', { settingsDarkMode: true });
    });
    await settings.screenshot({ path: test.info().outputPath('voice-custom-dark.png') });
    await settings
      .getByRole('combobox', { name: 'Text-to-speech provider', exact: true })
      .selectOption('elevenlabs');
    await expect(
      settings.getByRole('slider', { name: 'Stability slider', exact: true }),
    ).toHaveValue('0.5');
    await expect(
      settings.getByRole('switch', { name: 'Speaker boost', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(
      'eleven_flash_v2_5',
    );
    await settings
      .getByRole('combobox', { name: 'Text-to-speech provider', exact: true })
      .selectOption('none');
    await expect(settings.getByRole('button', { name: 'Test Voice', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
