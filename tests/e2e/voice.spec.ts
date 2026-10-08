import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchEnvironment } from './environment';
import { configureMock } from './mock';
// Audio HTTP fixtures exercise transport/playback only; they are not real TTS acceptance.
// eslint-disable-next-line no-empty-pattern
test('voice Off is dormant; real Windows voices synthesize and play; Esc cancels playback', async ({}, info) => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-native-voice-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await configureMock(pet);
    await pet.evaluate(() => {
      const root = window as unknown as {
        voiceAudit: {
          contexts: number;
          starts: number;
          peak: number;
          frames: number;
          statuses: string[];
          promise?: Promise<unknown>;
        };
      };
      root.voiceAudit = { contexts: 0, starts: 0, peak: 0, frames: 0, statuses: [] };
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          root.voiceAudit.contexts++;
        }
        createBufferSource() {
          const source = super.createBufferSource(),
            start = source.start.bind(source);
          source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
            root.voiceAudit.starts++;
            if (source.buffer) {
              const data = source.buffer.getChannelData(0);
              root.voiceAudit.frames += data.length;
              for (const sample of data)
                root.voiceAudit.peak = Math.max(root.voiceAudit.peak, Math.abs(sample));
            }
            const ended = source.onended;
            source.onended = (event) => {
              root.voiceAudit.statuses.push('ended');
              ended?.call(source, event);
            };
            start(...args);
          };
          return source;
        }
      };
    });
    await pet.evaluate(async () => {
      await window.companion.patchConfig('bubble', { dwellMs: 0 });
      await window.companion.submitInput('Text-only verification');
      await window.companion.openSettings('Voice');
    });
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const result = await window.companion.getChatUi();
          return result.ok && !result.value.reply?.streaming;
        }),
      )
      .toBe(true);
    expect(
      await pet.evaluate(
        () => (window as unknown as { voiceAudit: { contexts: number } }).voiceAudit.contexts,
      ),
    ).toBe(0);
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings');
    await expect(settings.getByRole('heading', { name: 'Voice', exact: true })).toBeVisible();
    await expect(
      settings.getByText(
        'The companion will respond in text only. The speaking animation will follow the text as it streams in.',
      ),
    ).toBeVisible();
    await expect(settings.getByLabel('Speaking rate', { exact: true })).toHaveCount(0);
    await settings
      .getByLabel('Text-to-speech provider', { exact: true })
      .selectOption('windows-sapi');
    await expect
      .poll(() => settings.getByLabel('Voice', { exact: true }).locator('option').count())
      .toBeGreaterThan(1);
    await expect(
      settings.getByLabel('If speech fails', { exact: true }).locator('option[value="sapi"]'),
    ).toHaveCount(0);
    const outputs = await settings.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphone = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          return 'opened';
        })
        .catch((error) => (error as Error).name);
      return {
        outputs: devices
          .filter((device) => device.kind === 'audiooutput')
          .map((device) => ({ id: device.deviceId, label: device.label })),
        microphone,
      };
    });
    expect(outputs.microphone).toBe('NotAllowedError');
    await info.attach('output-permission-audit', {
      body: JSON.stringify(outputs, null, 2),
      contentType: 'application/json',
    });
    await writeFile(
      info.outputPath('output-permission-audit.json'),
      JSON.stringify(outputs, null, 2),
    );
    await settings.screenshot({ path: info.outputPath('voice-windows-light.png') });
    await settings.getByRole('button', { name: 'Test Voice', exact: true }).click();
    await expect(settings.getByRole('status', { name: 'Voice test' })).toContainText(
      'Played test phrase',
      { timeout: 20000 },
    );
    const audit = await pet.evaluate(
      () =>
        (
          window as unknown as {
            voiceAudit: {
              contexts: number;
              starts: number;
              peak: number;
              frames: number;
              statuses: string[];
            };
          }
        ).voiceAudit,
    );
    expect(audit.contexts).toBe(1);
    expect(audit.starts).toBeGreaterThan(0);
    expect(audit.peak).toBeGreaterThan(0.01);
    expect(audit.frames).toBeGreaterThan(10000);
    expect(audit.statuses).toContain('ended');
    await info.attach('native-voice-audit', {
      body: JSON.stringify(audit, null, 2),
      contentType: 'application/json',
    });
    await writeFile(info.outputPath('native-voice-audit.json'), JSON.stringify(audit, null, 2));
    await pet.evaluate(() => {
      const root = window as unknown as { voiceAudit: { promise?: Promise<unknown> } };
      root.voiceAudit.promise = window.companion.testVoice();
    });
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const result = await window.companion.getChatUi();
          return result.ok && result.value.speaking;
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        pet.evaluate(
          () => (window as unknown as { voiceAudit: { starts: number } }).voiceAudit.starts,
        ),
      )
      .toBeGreaterThan(audit.starts);
    const startsBefore = await pet.evaluate(
      () => (window as unknown as { voiceAudit: { starts: number } }).voiceAudit.starts,
    );
    await pet.keyboard.press('Escape');
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const result = await window.companion.getChatUi();
          return result.ok && result.value.speaking;
        }),
      )
      .toBe(false);
    const cancelled = await pet.evaluate(
      () =>
        (
          window as unknown as {
            voiceAudit: {
              promise: Promise<{ ok: boolean; error?: { code: string } }>;
              starts: number;
            };
          }
        ).voiceAudit.promise,
    );
    expect(cancelled).toMatchObject({ ok: false, error: { code: 'ABORTED' } });
    expect(
      await pet.evaluate(
        () => (window as unknown as { voiceAudit: { starts: number } }).voiceAudit.starts,
      ),
    ).toBe(startsBefore);
    await settings.getByRole('switch', { name: 'Dark mode', exact: true }).click();
    await settings.screenshot({ path: info.outputPath('voice-windows-dark.png') });
    await settings.getByLabel('Text-to-speech provider', { exact: true }).selectOption('none');
    await expect(settings.getByRole('button', { name: 'Test Voice', exact: true })).toHaveCount(0);
    await pet.evaluate(() => window.companion.submitInput('Still works without speech'));
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const result = await window.companion.getChatUi();
          return result.ok && !result.value.reply?.streaming;
        }),
      )
      .toBe(true);
    expect(
      await pet.evaluate(
        () => (window as unknown as { voiceAudit: { contexts: number } }).voiceAudit.contexts,
      ),
    ).toBe(1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// eslint-disable-next-line no-empty-pattern
test('compatible speech PCM transport, credentials, queue replacement, failures and voice-off switching', async ({}) => {
  test.setTimeout(90000);
  const requests: { path: string; key?: string; text?: string }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString()) as { input?: string })
      : {};
    requests.push({
      path: request.url ?? '',
      key: request.headers.authorization,
      text: body.input,
    });
    if (request.url?.endsWith('/audio/voices')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ voices: ['fixture-voice'] }));
      return;
    }
    if (request.url?.includes('/fail/')) {
      response.writeHead(500);
      response.end('private upstream details');
      return;
    }
    response.setHeader('Content-Type', 'audio/pcm');
    const pcm = Buffer.alloc(24000 * 2 * 3);
    for (let i = 0; i < pcm.length / 2; i++)
      pcm.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 24000) * 1000), i * 2);
    response.write(pcm.subarray(0, 24000));
    setTimeout(() => response.end(pcm.subarray(24000)), 100);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-http-voice-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await configureMock(pet);
    await pet.evaluate(async (url) => {
      await window.companion.patchConfig('bubble', { dwellMs: 0 });
      await window.companion.setSecret('tts.openai-compatible-tts', 'fixture-secret');
      await window.companion.patchConfig('tts', {
        provider: 'openai-compatible-tts',
        baseUrl: url,
        voice: 'fixture-voice',
        format: 'pcm16',
        onNewMessage: 'queue',
        cacheAudio: false,
      });
      await window.companion.submitInput('Initial queued conversation');
    }, url);
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const ui = await window.companion.getChatUi();
          return ui.ok && ui.value.speaking;
        }),
      )
      .toBe(true);
    await pet.evaluate(async () => {
      await window.companion.submitInput('Discarded pending message');
      await window.companion.submitInput('Replacement pending message');
    });
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const ui = await window.companion.getChatUi();
          return ui.ok && ui.value.queuedMessage;
        }),
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          pet.evaluate(async () => {
            const ui = await window.companion.getChatUi();
            return ui.ok && ui.value.reply?.userText;
          }),
        { timeout: 20000 },
      )
      .toBe('Replacement pending message');
    expect(
      requests.filter((request) => request.text?.includes('Discarded pending message')),
    ).toHaveLength(0);
    expect(
      requests
        .filter((request) => request.path.endsWith('/audio/speech'))
        .every((request) => request.key === 'Bearer fixture-secret'),
    ).toBe(true);
    await pet.evaluate(async (url) => {
      await window.companion.abortChat();
      await window.companion.patchConfig('tts', {
        baseUrl: url.replace('/v1', '/fail/v1'),
        onNewMessage: 'stop',
      });
      await window.companion.submitInput('Keep text on speech failure');
    }, url);
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const ui = await window.companion.getChatUi();
          return ui.ok && ui.value.speechNotice;
        }),
      )
      .toContain('continuing as text');
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const ui = await window.companion.getChatUi();
          return ui.ok && ui.value.reply?.text;
        }),
      )
      .toContain('Keep text on speech failure');
    await pet.evaluate(async () => {
      await window.companion.patchConfig('tts', { provider: 'none' });
      await window.companion.submitInput('Off after failure');
    });
    await expect
      .poll(() =>
        pet.evaluate(async () => {
          const ui = await window.companion.getChatUi();
          return ui.ok && !ui.value.reply?.streaming && ui.value.reply?.text;
        }),
      )
      .toContain('Off after failure');
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
