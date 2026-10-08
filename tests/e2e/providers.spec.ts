import { test, expect, _electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnvironment } from './environment';
test('all production transports stream and providers switch within one session', async () => {
  const payloads: { url: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const route = req.url ?? '';
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          route.startsWith('/api/tags')
            ? { models: [{ name: 'fixture' }] }
            : { data: [{ id: 'fixture' }] },
        ),
      );
      return;
    }
    let input = '';
    for await (const chunk of req) input += String(chunk);
    const body = JSON.parse(input);
    payloads.push({ url: route, body });
    if (!body.stream) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          route === '/api/chat'
            ? { message: { content: 'OK' }, done: true }
            : route === '/v1/messages'
              ? {
                  content: [{ type: 'text', text: 'OK' }],
                  stop_reason: 'end_turn',
                  usage: { input_tokens: 1, output_tokens: 1 },
                }
              : { choices: [{ message: { content: 'OK' } }] },
        ),
      );
      return;
    }
    const records =
      route === '/api/chat'
        ? [
            { message: { content: 'Native ' }, done: false },
            { message: { content: 'Ollama reply' }, done: false },
            { done: true },
          ]
        : route === '/v1/messages'
          ? [
              { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Anthropic ' } },
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'reply' } },
              { type: 'message_stop' },
            ]
          : [
              { choices: [{ delta: { content: 'OpenAI ' } }] },
              { choices: [{ delta: { content: 'compatible reply' }, finish_reason: 'stop' }] },
            ];
    res.setHeader(
      'Content-Type',
      route === '/api/chat' ? 'application/x-ndjson' : 'text/event-stream',
    );
    for (const record of records)
      res.write(
        route === '/api/chat'
          ? JSON.stringify(record) + '\n'
          : 'data: ' + JSON.stringify(record) + '\n\n',
      );
    res.end(route === '/v1/chat/completions' ? 'data: [DONE]\n\n' : '');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  const base = `http://127.0.0.1:${address.port}`,
    directory = await mkdtemp(join(tmpdir(), 'littlellm-providers-'));
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: launchEnvironment(directory),
  });
  try {
    const pet = await app.firstWindow();
    await pet.getByTestId('sprite').waitFor();
    for (const [provider, reply] of [
      ['openai-compatible', 'OpenAI compatible reply'],
      ['anthropic', 'Anthropic reply'],
      ['ollama', 'Native Ollama reply'],
      ['openai-compatible', 'OpenAI compatible reply'],
    ] as const) {
      await pet.evaluate(
        async ({ provider, base }) => {
          const cfg = await window.companion.getConfig();
          if (!cfg.ok) throw new Error('No config');
          const set = await window.companion.setConfig('llm', {
            ...cfg.value.llm,
            provider,
            baseUrl: base + (provider === 'openai-compatible' ? '/v1' : ''),
            model: 'fixture',
          });
          if (!set.ok) throw new Error(set.error.userMessage);
          const test = await window.companion.testModelConnection();
          if (!test.ok || test.value.models.length !== 1) throw new Error('Connection failed');
          await window.companion.setConfig('bubble', {
            ...cfg.value.bubble,
            textReveal: 'instant',
          });
          await window.companion.chat(provider + ' prompt');
        },
        { provider, base },
      );
      await expect(pet.getByTestId('bubble-content')).toHaveText(reply);
      await expect(pet.getByTestId('bubble')).toHaveAttribute('data-streaming', 'false');
    }
    const anthropic = payloads.find((p) => p.url === '/v1/messages' && p.body.stream);
    expect(anthropic?.body.system).toBeTruthy();
    expect((anthropic?.body.messages as { role: string }[]).some((m) => m.role === 'system')).toBe(
      false,
    );
    const ollama = payloads.find((p) => p.url === '/api/chat' && p.body.stream);
    expect((ollama?.body.messages as { role: string }[])[0]?.role).toBe('system');
    expect(
      (ollama?.body.messages as { role: string }[]).filter((m) => m.role === 'assistant'),
    ).toHaveLength(2);
  } finally {
    await app.close();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
