import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { configSchema, personaCardSchema } from '../../src/shared/config';
import { launchEnvironment } from './environment';
// eslint-disable-next-line no-empty-pattern
test('Persona native Settings, static greeting, real provider mappings and history isolation', async ({}, info) => {
  test.setTimeout(90000);
  const requests: Record<string, unknown>[] = [];
  let failGreeting = false;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    if (request.url === '/api/show') {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"capabilities":["completion"]}');
      return;
    }
    requests.push(body);
    if (failGreeting) {
      response.writeHead(503);
      response.end('{"error":"fixture unavailable"}');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/api/chat'
          ? { message: { content: 'Mira the fox says hello.' }, done: true }
          : request.url === '/v1/messages'
            ? {
                content: [{ type: 'text', text: 'Mira the fox says hello.' }],
                stop_reason: 'end_turn',
                usage: { input_tokens: 10, output_tokens: 8 },
              }
            : {
                choices: [
                  { message: { content: 'Mira the fox says hello.' }, finish_reason: 'stop' },
                ],
              },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-persona-'));
  const card = personaCardSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Mira',
    description: 'A friendly fox.',
    exampleDialogue: [{ user: 'Example hello', assistant: 'Example fox reply' }],
  });
  const config = configSchema.parse({
    llm: { baseUrl: baseUrl + '/v1', model: 'fixture', stream: false, persistence: 'permanent' },
    bubble: { dwellMs: 0 },
    persona: {
      enabled: true,
      activeId: card.id,
      library: [card],
      greeting: {
        mode: 'static',
        text: 'Hello {{user.name}}, I am {{persona.name}}.',
        delayMs: 100,
      },
    },
  });
  await writeFile(join(directory, 'config.json'), JSON.stringify(config));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  app.process().stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes('Generated greeting failed')) console.log(text.trim());
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await expect(pet.getByTestId('bubble')).toContainText('Hello there, I am Mira.');
    expect(requests).toHaveLength(0);
    const history = JSON.parse(await readFile(join(directory, 'conversation.json'), 'utf8'));
    expect(history.exchanges).toEqual([{ assistant: 'Hello there, I am Mira.' }]);
    await pet.evaluate(() => window.companion.openSettings('Persona'));
    await expect.poll(() => app.windows().length).toBe(2);
    const settings = app.windows().find((page) => page !== pet);
    if (!settings) throw new Error('Settings missing');
    await expect(settings.getByRole('heading', { name: 'Persona', exact: true })).toBeVisible();
    await expect(settings.getByLabel('Who they are', { exact: true })).toHaveValue(
      'A friendly fox.',
    );
    await settings.screenshot({ path: info.outputPath('persona-light.png') });
    await settings.getByRole('switch', { name: 'Dark mode' }).click();
    await settings.screenshot({ path: info.outputPath('persona-dark.png') });
    await settings
      .getByLabel('Who they are', { exact: true })
      .fill('A fox named {{persona.name}}. {{typo}}');
    await settings.getByLabel('Who they are', { exact: true }).press('Tab');
    await expect(settings.getByText('Unrecognized variables: typo')).toBeVisible();
    await settings.getByRole('button', { name: 'Show the assembled prompt' }).click();
    await expect(settings.getByRole('region', { name: 'Assembled prompt' })).toContainText(
      'A fox named Mira. {{typo}}',
    );
    for (const provider of ['openai-compatible', 'anthropic', 'ollama'] as const) {
      const result = await settings.evaluate(
        async ({ provider, baseUrl }) => {
          const cfg = await window.companion.getConfig();
          if (!cfg.ok) throw new Error('config');
          await window.companion.setConfig('llm', {
            ...cfg.value.llm,
            provider,
            baseUrl: provider === 'openai-compatible' ? baseUrl + '/v1' : baseUrl,
            model: 'fixture',
            stream: false,
          });
          if (provider === 'anthropic')
            await window.companion.setSecret('llm.anthropic', 'fixture-key');
          return window.companion.testPersona();
        },
        { provider, baseUrl },
      );
      if (!result.ok)
        throw new Error(`${provider}: ${result.error.code}: ${result.error.userMessage}`);
      expect(result.value).toBe('Mira the fox says hello.');
    }
    expect(
      JSON.parse(await readFile(join(directory, 'conversation.json'), 'utf8')).exchanges,
    ).toEqual(history.exchanges);
    const openai = requests[0],
      anthropic = requests[1],
      ollama = requests[2];
    expect(openai?.messages).toMatchObject([
      { role: 'system' },
      { role: 'user', content: 'Example hello' },
      { role: 'assistant', content: 'Example fox reply' },
      { role: 'user' },
    ]);
    expect(anthropic?.system).toContain('You are Mira');
    expect(
      (anthropic?.messages as { role: string }[]).some((message) => message.role === 'system'),
    ).toBe(false);
    expect((ollama?.messages as { role: string }[])[0]).toMatchObject({ role: 'system' });
    expect(ollama).not.toHaveProperty('system');
    const exportedPath = join(directory, 'Mira.persona.json');
    await app.evaluate(({ dialog }, path) => {
      (
        dialog as unknown as {
          showMessageBox: () => Promise<{ response: number; checkboxChecked: boolean }>;
        }
      ).showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      (
        dialog as unknown as {
          showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
        }
      ).showSaveDialog = async () => ({ canceled: false, filePath: path });
      (
        dialog as unknown as {
          showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
        }
      ).showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, exportedPath);
    expect(
      await settings.evaluate(() =>
        window.companion.exportPersona('00000000-0000-4000-8000-000000000001'),
      ),
    ).toMatchObject({ ok: true, value: true });
    const exported = JSON.parse(await readFile(exportedPath, 'utf8'));
    expect(exported.schemaVersion).toBe(1);
    expect(exported).not.toHaveProperty('apiKey');
    await writeFile(
      exportedPath,
      JSON.stringify({ ...exported, voiceOverride: 'Untrusted import voice' }),
    );
    const imported = await settings.evaluate(() => window.companion.importPersona());
    if (!imported.ok) throw new Error(imported.error.userMessage);
    expect(imported.value.persona.library.at(-1)?.voiceOverride).toBeUndefined();
    expect(imported.value.persona.activeId).not.toBe(card.id);
    await writeFile(exportedPath, 'x'.repeat(65537));
    expect(await settings.evaluate(() => window.companion.importPersona())).toMatchObject({
      ok: false,
    });
    await settings.getByRole('button', { name: 'Duplicate this persona', exact: true }).click();
    await expect(settings.getByLabel('Name', { exact: true })).toHaveValue('Mira copy');
    await expect
      .poll(async () => {
        try {
          await readFile(join(directory, 'conversation.json'));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
    await settings.getByRole('switch', { name: 'Give the assistant a persona' }).click();
    await expect(settings.getByLabel('Who they are', { exact: true })).toHaveCount(0);
    await settings.evaluate(async () => {
      const result = await window.companion.getConfig();
      if (!result.ok) throw new Error('config');
      await window.companion.setConfig('llm', { ...result.value.llm, retryAttempts: 0 });
      await window.companion.patchConfig('persona', {
        enabled: true,
        greeting: {
          ...result.value.persona.greeting,
          mode: 'generated',
          frequency: 'per-show',
          delayMs: 500,
          speak: false,
        },
      });
    });
    const showCycle = () =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('pet'),
        );
        if (!win) throw new Error('pet');
        win.hide();
        win.showInactive();
      });
    await showCycle();
    await expect.poll(() => requests.length).toBe(4);
    await expect
      .poll(async () => {
        const result = await pet.evaluate(() => window.companion.getChatUi());
        if (!result.ok) throw new Error(result.error.userMessage);
        return result.value.reply;
      })
      .not.toBeNull();
    await expect(pet.getByTestId('bubble')).toContainText('Mira the fox says hello.');
    expect(
      JSON.parse(await readFile(join(directory, 'conversation.json'), 'utf8')).exchanges,
    ).toEqual([{ assistant: 'Mira the fox says hello.' }]);
    await showCycle();
    await pet.evaluate(() => window.companion.toggleInput());
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(requests).toHaveLength(4);
    await pet.evaluate(() => window.companion.closeInput());
    failGreeting = true;
    await showCycle();
    await expect.poll(() => requests.length).toBe(5);
    await expect
      .poll(async () => {
        const result = await pet.evaluate(() => window.companion.getChatUi());
        return result.ok ? [result.value.reply, result.value.error] : false;
      })
      .toEqual([null, null]);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
