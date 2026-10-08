import { expect, it, vi } from 'vitest';
import { configSchema } from '../../src/shared/config';
import { AnthropicProvider } from '../../src/main/llm/anthropic';
import { OllamaProvider } from '../../src/main/llm/ollama';
import type { ChatOptions } from '../../src/main/llm/types';
const cfg = { ...configSchema.parse({}).llm, baseUrl: 'http://localhost:11434' };
const options = (): ChatOptions => ({
  signal: new AbortController().signal,
  model: 'fixture',
  systemPrompt: 'System only.',
  stopSequences: ['END'],
});
async function collect<T>(values: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}
function response(records: unknown[], sse: boolean) {
  const bytes = new TextEncoder().encode(
    records
      .map((record) =>
        sse ? `data: ${JSON.stringify(record)}\n\n` : JSON.stringify(record) + '\n',
      )
      .join(''),
  );
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    }),
  );
}
const anthropicEvents = [
  { type: 'message_start', message: { usage: { input_tokens: 8, output_tokens: 1 } } },
  { type: 'ping' },
  { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello 世界' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  { type: 'message_stop' },
];
it('streams Anthropic text with top-level system, private thinking omitted and cumulative usage', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(anthropicEvents, true));
  const events = await collect(
    new AnthropicProvider(cfg, async () => 'secret', fetcher).chat(
      [{ role: 'user', content: 'Hi' }],
      options(),
    ),
  );
  expect(events).toEqual([
    { type: 'text', text: 'Hello 世界' },
    { type: 'done', usage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 } },
  ]);
  const call = fetcher.mock.calls[0];
  expect(String(call?.[0])).toBe('http://localhost:11434/v1/messages');
  const payload = JSON.parse(String(call?.[1]?.body));
  expect(payload.system).toBe('System only.');
  expect(payload.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  expect(payload.stop_sequences).toEqual(['END']);
  expect(new Headers(call?.[1]?.headers).get('x-api-key')).toBe('secret');
  expect(JSON.stringify(events)).not.toContain('secret');
});
it('streams Ollama NDJSON across UTF-8 boundaries and uses native option names', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    response(
      [
        { message: { content: 'Hello 世界' }, done: false },
        { done: true, prompt_eval_count: 8, eval_count: 3 },
      ],
      false,
    ),
  );
  expect(
    await collect(
      new OllamaProvider(cfg, undefined, fetcher).chat(
        [{ role: 'user', content: 'Hi' }],
        options(),
      ),
    ),
  ).toEqual([
    { type: 'text', text: 'Hello 世界' },
    { type: 'done', usage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 } },
  ]);
  const call = fetcher.mock.calls[0],
    payload = JSON.parse(String(call?.[1]?.body));
  expect(String(call?.[0])).toBe('http://localhost:11434/api/chat');
  expect(payload.messages[0]).toEqual({ role: 'system', content: 'System only.' });
  expect(payload).not.toHaveProperty('system');
  expect(payload.options).toMatchObject({
    temperature: 0.7,
    top_p: 1,
    num_predict: 1024,
    stop: ['END'],
  });
});
it('handles both native non-streaming responses and refuses missing completion markers', async () => {
  const anthropic = new AnthropicProvider(
    cfg,
    undefined,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          content: [{ type: 'text', text: 'Complete' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 2, output_tokens: 1 },
        }),
      ),
  );
  expect((await collect(anthropic.chat([], { ...options(), stream: false })))[0]).toEqual({
    type: 'text',
    text: 'Complete',
  });
  const ollama = new OllamaProvider(
    cfg,
    undefined,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: { content: 'Complete' }, done: true }, null, 2)),
      ),
  );
  expect((await collect(ollama.chat([], { ...options(), stream: false })))[0]).toEqual({
    type: 'text',
    text: 'Complete',
  });
  for (const provider of [
    new AnthropicProvider(
      cfg,
      undefined,
      vi.fn<typeof fetch>().mockResolvedValue(response(anthropicEvents.slice(0, -1), true)),
    ),
    new OllamaProvider(
      cfg,
      undefined,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response([{ message: { content: 'Partial' }, done: false }], false)),
    ),
  ]) {
    expect((await collect(provider.chat([], options()))).at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'INVALID_RESPONSE' },
    });
  }
});
it('lists native models and guards Anthropic pagination against repeating cursors', async () => {
  expect(
    await new OllamaProvider(
      cfg,
      undefined,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ models: [{ name: 'local' }] })),
    ).listModels(),
  ).toEqual([{ id: 'local', name: 'local', supportsImages: null }]);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ data: [{ id: 'a', display_name: 'A' }], has_more: true, last_id: 'a' }),
    )
    .mockResolvedValueOnce(Response.json({ data: [{ id: 'b' }], has_more: false }));
  expect(await new AnthropicProvider(cfg, undefined, fetcher).listModels()).toHaveLength(2);
  const loop = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ data: [], has_more: true, last_id: 'same' }));
  await expect(new AnthropicProvider(cfg, undefined, loop).listModels()).rejects.toThrow(
    'unsupported',
  );
});
it('normalizes streamed errors, missing hosted authentication and cancellation without secret leakage', async () => {
  for (const provider of [
    new AnthropicProvider(
      cfg,
      undefined,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response(
            [{ type: 'error', error: { type: 'overloaded_error', message: 'PRIVATE' } }],
            true,
          ),
        ),
    ),
    new OllamaProvider(
      cfg,
      undefined,
      vi.fn<typeof fetch>().mockResolvedValue(response([{ error: 'PRIVATE' }], false)),
    ),
  ]) {
    const events = await collect(provider.chat([], options()));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error' });
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  }
  expect(
    (
      await collect(
        new AnthropicProvider({ ...cfg, baseUrl: 'https://api.anthropic.com' }).chat([], options()),
      )
    )[0],
  ).toMatchObject({ type: 'error', error: { code: 'AUTH_MISSING' } });
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await collect(new OllamaProvider(cfg).chat([], { ...options(), signal: controller.signal }))
    )[0],
  ).toMatchObject({ type: 'error', error: { code: 'ABORTED' } });
});
