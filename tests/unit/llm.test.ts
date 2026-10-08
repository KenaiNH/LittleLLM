import { describe, it, expect, vi } from 'vitest';
import { configSchema } from '../../src/shared/config';
import { OpenAICompatibleProvider } from '../../src/main/llm/openaiCompatible';
import { parseSse } from '../../src/main/llm/streamParser';
import { historyMessages, estimateTokens } from '../../src/main/llm/history';
import { buildSystemPrompt } from '../../src/main/llm/persona';
import type { ChatDelta, ChatOptions } from '../../src/main/llm/types';
const cfg = configSchema.parse({}).llm;
const signal = () => new AbortController().signal;
async function collect<T>(stream: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}
function bytes(text: string, split = 1) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < encoded.length; i += split)
        controller.enqueue(encoded.slice(i, i + split));
      controller.close();
    },
  });
}
function response(text: string) {
  return new Response(bytes(text, 3), { headers: { 'Content-Type': 'text/event-stream' } });
}
const event = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\r\n\r\n`;
const complete =
  event('Hello 世界!') +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';
const opts = (): ChatOptions => ({
  signal: signal(),
  model: 'fixture',
  systemPrompt: 'Exact system prompt.',
  stream: true,
});
function provider(fetcher: typeof fetch, overrides: Partial<typeof cfg> = {}) {
  return new OpenAICompatibleProvider(
    { ...cfg, baseUrl: 'http://127.0.0.1:1234/v1', ...overrides },
    async () => undefined,
    fetcher,
  );
}
describe('bounded SSE framing', () => {
  it('supports CR-only separators split across chunks', async () =>
    expect(await collect(parseSse(bytes('data: first\r\rdata: second\r\r'), signal()))).toEqual([
      'first',
      'second',
    ]));
  it('preserves split UTF-8, CRLF, comments and multiline data', async () =>
    expect(
      await collect(
        parseSse(bytes(': heartbeat\r\ndata: {"text":\r\ndata: "世界"}\r\n\r\n'), signal()),
      ),
    ).toEqual(['{"text":\n"世界"}']));
  it('rejects a truncated event and invalid UTF-8', async () => {
    await expect(collect(parseSse(bytes('data: unfinished'), signal()))).rejects.toThrow(
      'Truncated',
    );
    const bad = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([255]));
        c.close();
      },
    });
    await expect(collect(parseSse(bad, signal()))).rejects.toThrow();
  });
  it('cancels a blocked read on abort', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const task = collect(parseSse(body, controller.signal));
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });
});
describe('OpenAI-compatible wire transport', () => {
  it('streams split tokens, sends complete settings, and reports one terminal event', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(complete));
    const events = await collect(provider(fetcher).chat([{ role: 'user', content: 'Hi' }], opts()));
    expect(events).toEqual([
      { type: 'text', text: 'Hello 世界!' },
      { type: 'done', usage: undefined },
    ]);
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error('Missing request');
    const [url, request] = call;
    expect(String(url)).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(JSON.parse(String(request?.body))).toMatchObject({
      messages: [
        { role: 'system', content: 'Exact system prompt.' },
        { role: 'user', content: 'Hi' },
      ],
      stream: true,
      temperature: 0.7,
      top_p: 1,
      max_tokens: 1024,
    });
    expect(new Headers(request?.headers).has('Authorization')).toBe(false);
  });
  it('maps malformed JSON and an uncompleted stream to terminal errors', async () => {
    for (const text of ['data: broken\n\n', event('partial')]) {
      const events = await collect(
        provider(vi.fn<typeof fetch>().mockResolvedValue(response(text))).chat([], opts()),
      );
      expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'INVALID_RESPONSE' } });
    }
  });
  it('supports non-streaming JSON and usage', async () => {
    const body = {
      choices: [{ message: { content: 'Complete reply' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    };
    const events = await collect(
      provider(vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))).chat([], {
        ...opts(),
        stream: false,
      }),
    );
    expect(events).toEqual([
      { type: 'text', text: 'Complete reply' },
      { type: 'done', usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 } },
    ]);
  });
  it('never retries 4xx and never exposes an untrusted error body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: { message: 'SECRET should never cross IPC' } }, { status: 401 }),
      );
    const events = await collect(provider(fetcher).chat([], opts()));
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'AUTH_INVALID' } });
    expect(JSON.stringify(events)).not.toContain('SECRET');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries connection resets only before the response starts', async () => {
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(reset)
        .mockResolvedValueOnce(response(complete));
    await collect(provider(fetcher, { retryAttempts: 1 }).chat([], opts()));
    expect(fetcher).toHaveBeenCalledTimes(2);
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(new TextEncoder().encode(event('partial')));
      },
    });
    const second = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    const events: ChatDelta[] = [];
    for await (const delta of provider(second).chat([], opts())) {
      events.push(delta);
      if (delta.type === 'text') controller?.error(reset);
    }
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'NETWORK_UNREACHABLE' } });
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('distinguishes cancellation, timeout, DNS and a missing local server', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      (
        await collect(
          provider(vi.fn<typeof fetch>()).chat([], { ...opts(), signal: cancelled.signal }),
        )
      ).at(-1),
    ).toMatchObject({ type: 'error', error: { code: 'ABORTED' } });
    const timed = new AbortController();
    timed.abort(new DOMException('deadline', 'TimeoutError'));
    expect(
      (
        await collect(provider(vi.fn<typeof fetch>()).chat([], { ...opts(), signal: timed.signal }))
      ).at(-1),
    ).toMatchObject({ type: 'error', error: { code: 'TIMEOUT' } });
    for (const [code, expected] of [
      ['ENOTFOUND', 'DNS_FAILURE'],
      ['ECONNREFUSED', 'CONNECTION_REFUSED'],
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code } }));
      expect((await collect(provider(fetcher).chat([], opts()))).at(-1)).toMatchObject({
        type: 'error',
        error: { code: expected },
      });
    }
  });
  it('negotiates a required developer role once and caches by base URL', async () => {
    const url = 'http://localhost:1234/role-probe-v1',
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { error: { message: "Unsupported value: messages[0].role 'system' is not supported" } },
            { status: 400 },
          ),
        )
        .mockResolvedValueOnce(response(complete))
        .mockResolvedValueOnce(response(complete));
    await collect(provider(fetcher, { baseUrl: url }).chat([], opts()));
    await collect(provider(fetcher, { baseUrl: url }).chat([], opts()));
    expect(fetcher.mock.calls.map(([, r]) => JSON.parse(String(r?.body)).messages[0].role)).toEqual(
      ['system', 'developer', 'developer'],
    );
  });
  it('substitutes credentials only in main-owned request headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(complete)),
      p = new OpenAICompatibleProvider(
        { ...cfg, customHeaders: { 'X-API-Key': '{{apiKey}}' } },
        async () => 'fixture-secret',
        fetcher,
      );
    const events = await collect(p.chat([], opts()));
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe(
      'fixture-secret',
    );
    expect(JSON.stringify(events)).not.toContain('fixture-secret');
  });
});
describe('history and prompt access', () => {
  it('trims complete exchanges and preserves the system and few-shot budget', () => {
    const exchanges = Array.from({ length: 12 }, (_, i) => ({ user: `u${i}`, assistant: `a${i}` }));
    expect(
      historyMessages(exchanges, 'current', { ...cfg, contextMode: 'last5' }, 'system'),
    ).toHaveLength(11);
    expect(
      historyMessages(exchanges, 'current', { ...cfg, contextMode: 'none' }, 'system'),
    ).toEqual([{ role: 'user', content: 'current' }]);
    const examples = [
      { role: 'user' as const, content: 'example' },
      { role: 'assistant' as const, content: 'example reply' },
    ];
    const trimmed = historyMessages(
      [
        { user: 'x'.repeat(4000), assistant: 'y'.repeat(4000) },
        { user: 'new', assistant: 'recent' },
      ],
      'current',
      { ...cfg, contextMode: 'token-budget', tokenBudget: 512 },
      'system',
      examples,
    );
    expect(trimmed).toEqual([
      ...examples,
      { role: 'user', content: 'new' },
      { role: 'assistant', content: 'recent' },
      { role: 'user', content: 'current' },
    ]);
  });
  it('estimates mixed CJK text and leaves disabled Persona byte-identical', () => {
    expect(estimateTokens('你好')).toBe(2);
    expect(estimateTokens('abcdef')).toBe(2);
    const config = configSchema.parse({ llm: { systemPrompt: '  Literal {{unknown}}\n\n' } });
    expect(buildSystemPrompt(config).text).toBe(config.llm.systemPrompt);
  });
});
