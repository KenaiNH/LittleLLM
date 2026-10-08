import { test, expect, _electron } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
const token = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`;
const ending =
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
test('main streams HTTP tokens, regenerates the user prompt, aborts and reports safe errors', async () => {
  const requests: {
      url: string;
      payload: { model: string; messages: { role: string; content: string }[]; stream: boolean };
    }[] = [],
    open = new Set<ServerResponse>();
  let aborted = false;
  const server = createServer(async (req, res) => {
    let input = '';
    for await (const chunk of req) input += String(chunk);
    const payload = JSON.parse(input);
    requests.push({ url: req.url ?? '', payload });
    const prompt = payload.messages.at(-1)?.content;
    if (prompt === 'unauthorized') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'untrusted-secret-value' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    open.add(res);
    res.on('close', () => {
      open.delete(res);
      if (prompt === 'abort-me') aborted = true;
    });
    if (prompt === 'abort-me') {
      res.write(token('Waiting for more tokens.'));
      return;
    }
    if (prompt === 'broken') {
      res.end('data: malformed\n\n');
      return;
    }
    const first = Buffer.from(token('Hello 世界')),
      second = token(' — streamed from the HTTP fixture.');
    for (let i = 0; i < first.length; i += 3) {
      if (res.destroyed) return;
      res.write(first.subarray(i, i + 3));
      await delay(2);
    }
    await delay(300);
    if (res.destroyed) return;
    res.write(second);
    await delay(100);
    if (!res.destroyed) res.end(ending);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const directory = await mkdtemp(join(tmpdir(), 'littlellm-chat-')),
    app = await _electron.launch({
      args: ['out/main/index.js'],
      env: launchEnvironment(directory),
    });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    await pet.evaluate(async (baseUrl) => {
      const result = await window.companion.getConfig();
      if (!result.ok) throw new Error('No config');
      await window.companion.setConfig('llm', {
        ...result.value.llm,
        baseUrl,
        model: 'fixture-local',
        retryAttempts: 0,
      });
      await window.companion.setConfig('bubble', { ...result.value.bubble, textReveal: 'instant' });
    }, `http://127.0.0.1:${address.port}/v1`);
    const first = await pet.evaluate(() => window.companion.chat('hello'));
    expect(first.ok).toBe(true);
    const bubble = pet.getByTestId('bubble');
    await expect(bubble).toHaveAttribute('data-streaming', 'true');
    await expect(bubble).toContainText('Hello 世界');
    await expect(bubble).toHaveAttribute('data-streaming', 'false');
    await expect(bubble).toContainText('streamed from the HTTP fixture');
    expect(requests[0]?.url).toBe('/v1/chat/completions');
    expect(requests[0]?.payload).toMatchObject({ model: 'fixture-local', stream: true });
    expect(requests[0]?.payload.messages.at(-1)).toEqual({ role: 'user', content: 'hello' });
    await bubble.getByRole('button', { name: 'Regenerate' }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(bubble).toHaveAttribute('data-streaming', 'false');
    expect(requests[1]?.payload.messages.filter((m) => m.role === 'user')).toEqual([
      { role: 'user', content: 'hello' },
    ]);
    expect(requests[1]?.payload.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
    await pet.evaluate(() => window.companion.chat('abort-me'));
    await expect(bubble).toContainText('Waiting for more tokens.');
    await bubble.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(bubble).toHaveAttribute('data-streaming', 'false');
    await expect.poll(() => aborted).toBe(true);
    expect(
      await pet.evaluate(async () => {
        const state = await window.companion.getChatUi();
        return state.ok ? state.value.error : null;
      }),
    ).toBeNull();
    await pet.evaluate(() => window.companion.chat('broken'));
    await expect(bubble.getByRole('alert')).toContainText('incomplete or unsupported');
    await pet.evaluate(() => window.companion.chat('unauthorized'));
    await expect(bubble.getByRole('alert')).toContainText('rejected the API key');
    expect(await bubble.innerText()).not.toContain('untrusted-secret-value');
    await pet.evaluate(() => window.companion.clearConversation());
    await expect(bubble).toHaveCount(0);
    await pet.evaluate(() => window.companion.chat('fresh'));
    await expect.poll(() => requests.length).toBe(6);
    await expect(bubble).toHaveAttribute('data-streaming', 'false');
    expect(requests[5]?.payload.messages.filter((m) => m.role === 'user')).toEqual([
      { role: 'user', content: 'fresh' },
    ]);
    expect(requests[5]?.payload.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  } finally {
    await app.close();
    for (const response of open) response.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
