import { it, expect, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { ChatService } from '../../src/main/llm/chatService';
import { configSchema } from '../../src/shared/config';
import type { ChatEvent } from '../../src/shared/llm';
import type { ChatMessage, LLMProvider } from '../../src/main/llm/types';
it('keeps a replacement started synchronously by an abort listener cancellable', async () => {
  const cfg = configSchema.parse({}),
    events: ChatEvent[] = [];
  let first = '',
    replacement = '';
  const provider: LLMProvider = {
    id: 'fixture',
    supportsImages: false,
    async *chat(_messages, { signal }) {
      yield { type: 'text', text: 'partial' };
      await delay(60000, undefined, { signal });
      yield { type: 'done' };
    },
  };
  const service = new ChatService(
    () => cfg,
    (event) => {
      events.push(event);
      if (event.requestId === first && event.delta.type === 'error' && !replacement)
        replacement = service.start('replacement');
    },
    undefined,
    () => provider,
  );
  first = service.start('first');
  await vi.waitFor(() =>
    expect(events.some((event) => event.requestId === first && event.delta.type === 'text')).toBe(
      true,
    ),
  );
  service.abort(first);
  await vi.waitFor(() =>
    expect(
      events.some((event) => event.requestId === replacement && event.delta.type === 'text'),
    ).toBe(true),
  );
  service.abort(replacement);
  expect(
    events.filter((event) => event.requestId === replacement && event.delta.type === 'error'),
  ).toHaveLength(1);
});
it('gives superseded and cancelled requests exactly one terminal event', async () => {
  const events: ChatEvent[] = [],
    cfg = configSchema.parse({}),
    provider: LLMProvider = {
      id: 'fixture',
      supportsImages: false,
      async *chat(_messages, { signal }) {
        yield { type: 'text', text: 'partial' };
        await delay(60000, undefined, { signal });
        yield { type: 'done' };
      },
    };
  const service = new ChatService(
    () => cfg,
    (event) => events.push(event),
    undefined,
    () => provider,
  );
  const first = service.start('first');
  await vi.waitFor(() =>
    expect(events.some((e) => e.requestId === first && e.delta.type === 'text')).toBe(true),
  );
  const second = service.start('second');
  service.abort(first);
  await vi.waitFor(() =>
    expect(events.some((e) => e.requestId === second && e.delta.type === 'text')).toBe(true),
  );
  service.abort(second);
  service.abort(second);
  await delay(10);
  for (const id of [first, second])
    expect(events.filter((e) => e.requestId === id && e.delta.type !== 'text')).toHaveLength(1);
  expect(events.filter((e) => e.delta.type === 'error').map((e) => e.delta)).toEqual([
    expect.objectContaining({ error: expect.objectContaining({ code: 'ABORTED' }) }),
    expect.objectContaining({ error: expect.objectContaining({ code: 'ABORTED' }) }),
  ]);
});
it('regenerates the original user turn without duplicating its previous exchange', async () => {
  const events: ChatEvent[] = [],
    requests: ChatMessage[][] = [],
    cfg = configSchema.parse({}),
    provider: LLMProvider = {
      id: 'fixture',
      supportsImages: false,
      async *chat(messages) {
        requests.push(messages);
        yield { type: 'text', text: 'answer' };
        yield { type: 'done' };
      },
    };
  const service = new ChatService(
    () => cfg,
    (event) => events.push(event),
    undefined,
    () => provider,
  );
  const first = service.start('original question');
  await vi.waitFor(() =>
    expect(events.some((e) => e.requestId === first && e.delta.type === 'done')).toBe(true),
  );
  const regen = service.regenerate();
  await vi.waitFor(() =>
    expect(events.some((e) => e.requestId === regen && e.delta.type === 'done')).toBe(true),
  );
  expect(requests[1]).toEqual([{ role: 'user', content: 'original question' }]);
  const next = service.start('next');
  await vi.waitFor(() =>
    expect(events.some((e) => e.requestId === next && e.delta.type === 'done')).toBe(true),
  );
  expect(requests[2]).toEqual([
    { role: 'user', content: 'original question' },
    { role: 'assistant', content: 'answer' },
    { role: 'user', content: 'next' },
  ]);
  service.clear();
  expect(() => service.regenerate()).toThrow('No prompt');
});
