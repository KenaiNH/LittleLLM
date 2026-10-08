import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { defaults } from '../../src/shared/config';
import { SpeechService } from '../../src/main/tts/speechService';
import type { TTSProvider } from '../../src/main/tts/types';
import type { TTSPacket } from '../../src/shared/tts';
const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture(provider?: TTSProvider) {
  const directory = mkdtempSync(join(tmpdir(), 'littlellm-speech-unit-'));
  paths.push(directory);
  const synthesize = vi.fn(async function* () {
    yield new Uint8Array([1, 2, 3, 4]);
  });
  const events: TTSPacket[] = [],
    gate = vi.fn(),
    notice = vi.fn(),
    drain = vi.fn();
  const service = new SpeechService(
    directory,
    (event) => events.push(event),
    gate,
    notice,
    drain,
    async () => undefined,
    async () =>
      provider ?? {
        id: 'fixture',
        requiresApiKey: false,
        listVoices: async () => [],
        synthesize,
        dispose() {},
      },
  );
  const cfg = {
    ...defaults().tts,
    provider: 'openai-compatible-tts' as const,
    format: 'pcm16' as const,
  };
  return { service, events, gate, notice, drain, synthesize, cfg };
}
it('streams ahead by at most two utterances and holds the state gate until playback drains', async () => {
  const { service, events, gate, drain, synthesize, cfg } = fixture(),
    id = randomUUID();
  service.begin(id, cfg);
  service.push(id, 'One sentence. Second sentence. Third sentence.', true);
  await vi.waitFor(() => expect(events.filter((event) => event.type === 'end')).toHaveLength(2));
  expect(synthesize).toHaveBeenCalledTimes(2);
  expect(drain).not.toHaveBeenCalled();
  service.feedback({ requestId: randomUUID(), segment: 0, status: 'ended' });
  expect(drain).not.toHaveBeenCalled();
  service.feedback({ requestId: id, segment: 0, status: 'ended' });
  await vi.waitFor(() => expect(events.filter((event) => event.type === 'end')).toHaveLength(3));
  service.feedback({ requestId: id, segment: 1, status: 'ended' });
  service.feedback({ requestId: id, segment: 2, status: 'ended' });
  expect(drain).toHaveBeenCalledTimes(1);
  expect(gate).toHaveBeenLastCalledWith(id, true);
});
it('full-reply policy delays synthesis, while limits truncate speech only', async () => {
  const { service, synthesize, cfg, events } = fixture(),
    id = randomUUID();
  service.begin(id, { ...cfg, beginSpeaking: 'full-reply', maxSpeechChars: 100 });
  service.push(id, 'Ready now. ' + 'word '.repeat(40));
  await Promise.resolve();
  expect(synthesize).not.toHaveBeenCalled();
  service.push(id, ' full reply end', true);
  await vi.waitFor(() => expect(events.some((event) => event.type === 'end')).toBe(true));
  const spoken = synthesize.mock.calls.map((call) => String((call as unknown[])[0])).join('');
  expect(spoken.length).toBeLessThanOrEqual(100);
  service.abort();
});
it('finishes only the audible sentence and cancels buffered future sentences', async () => {
  const { service, events, drain, cfg } = fixture(),
    id = randomUUID();
  service.begin(id, cfg);
  service.push(id, 'First sentence. Second sentence. Third sentence.', true);
  await vi.waitFor(() => expect(events.filter((event) => event.type === 'end')).toHaveLength(2));
  service.feedback({ requestId: id, segment: 0, status: 'started' });
  service.finishSentence();
  expect(events.at(-1)).toEqual({ type: 'finish', requestId: id, segment: 0 });
  service.feedback({ requestId: id, segment: 0, status: 'ended' });
  await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1));
  expect(events.filter((event) => event.type === 'start')).toHaveLength(2);
});
it('rejects late synthesis after abort and never caches an aborted partial stream', async () => {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider: TTSProvider = {
    id: 'fixture',
    requiresApiKey: false,
    listVoices: async () => [],
    async *synthesize() {
      yield new Uint8Array([1, 2]);
      await wait;
      yield new Uint8Array([3, 4]);
    },
    dispose() {},
  };
  const { service, events, cfg } = fixture(provider),
    id = randomUUID();
  service.begin(id, cfg);
  service.push(id, 'One sentence.', true);
  await vi.waitFor(() => expect(events.some((event) => event.type === 'data')).toBe(true));
  service.abort();
  const count = events.length;
  release();
  await new Promise((resolve) => setImmediate(resolve));
  expect(events).toHaveLength(count);
  expect(service.cache.size).toBe(0);
});
it('speech failure releases the audio gate and reports text fallback without affecting chat', async () => {
  const provider: TTSProvider = {
    id: 'fixture',
    requiresApiKey: false,
    listVoices: async () => [],
    async *synthesize() {
      yield new Uint8Array([1, 2]);
      throw new Error('private upstream detail');
    },
    dispose() {},
  };
  const { service, gate, notice, cfg } = fixture(provider),
    id = randomUUID();
  const done = service.preview(id, cfg, 'Hello.');
  await expect(done).rejects.toThrow();
  expect(gate).toHaveBeenLastCalledWith(id, true);
  expect(notice).toHaveBeenCalledWith(id, expect.stringContaining('continuing as text'), false);
});
