import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../../src/shared/config';
import { SentenceChunker } from '../../src/main/tts/sentenceChunker';
import { markdownToSpeech } from '../../src/main/tts/markdownToSpeech';
import { AudioCache, audioCacheKey } from '../../src/main/tts/audioCache';
import { OpenAICompatibleTTSProvider } from '../../src/main/tts/providers/openaiCompatibleTts';
import { NoneTTSProvider } from '../../src/main/tts/providers/none';
const directories: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'littlellm-tts-unit-'));
  directories.push(path);
  return path;
}
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
describe('speech processing', () => {
  it('buffers split links and fenced code, but starts complete sentences immediately', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Hello. Next [link')).toEqual(['Hello.']);
    expect(chunker.push(' text](https://example.com/a.b) works. \n```js\nalert("No. ')).toEqual([
      ' Next [link text](https://example.com/a.b) works.',
    ]);
    expect(chunker.push('Still code!");\n```')).toEqual([]);
    expect(chunker.push('\nEnd without punctuation', true)).toEqual([
      ' \n```js\nalert("No. Still code!");\n```\n',
      'End without punctuation',
    ]);
  });
  it('keeps abbreviations and decimals, handles ellipses, CJK and stream-end tails', () => {
    const chunker = new SentenceChunker(false);
    expect(chunker.push('Dr. Smith paid 3.14 dollars. Wait... Next ')).toEqual([
      'Dr. Smith paid 3.14 dollars.',
      ' Wait...',
    ]);
    expect(chunker.push('你好。再见！', true)).toEqual([' Next 你好。', '再见！']);
    expect(chunker.push('tail', true)).toEqual(['tail']);
  });
  it('holds indented and quoted fences and multi-backtick inline spans intact', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('  ~~~~js\nNo. Speech!\n  ~~~~\nNext ')).toEqual([
      '  ~~~~js\nNo. Speech!\n  ~~~~\n',
    ]);
    expect(chunker.push('``code. With `tick` here`` ends. After ')).toEqual([
      'Next ``code. With `tick` here`` ends.',
    ]);
    expect(chunker.push('\n> ~~~\n> Hidden. Code!\n> ~~~\n', true)).toEqual([
      ' After \n> ~~~\n> Hidden. Code!\n> ~~~\n',
    ]);
  });
  it('bounds processed unbroken text without splitting surrogate pairs', () => {
    const units = new SentenceChunker(false).push('x'.repeat(239) + '😀' + 'y'.repeat(250), true);
    expect(units.join('')).toBe('x'.repeat(239) + '😀' + 'y'.repeat(250));
    expect(units.every((unit) => unit.length <= 241 && !/[\uD800-\uDBFF]$/.test(unit))).toBe(true);
  });
  it('strips speech independently and implements code/link/emoji policies', () => {
    const cfg = defaults().tts;
    const source =
      '# Heading\n\n- **First**\n  - _Second_\n\n[documentation](https://example.com) 😀\n\n```ts\nconsole.log(1);\n```';
    expect(markdownToSpeech(source, cfg)).toBe('Heading First Second documentation code block');
    expect(markdownToSpeech(source, { ...cfg, codeBlockSpeech: 'skip', linkSpeech: 'skip' })).toBe(
      'Heading First Second',
    );
    const read = markdownToSpeech(source, {
      ...cfg,
      codeBlockSpeech: 'read',
      linkSpeech: 'full-url',
      emojiSpeech: 'describe',
    });
    expect(read).toContain('https://example.com');
    expect(read).toContain('grinning face');
    expect(read).toContain('console.log(1);');
    expect(source).toContain('**First**');
  });
});
describe('bounded completed audio cache', () => {
  it('normalizes keys, updates LRU, enforces the cap on writes and startup, and clears', () => {
    const dir = directory(),
      cache = new AudioCache(dir, 8),
      cfg = defaults().tts;
    const one = audioCacheKey(cfg, 'one', 'wav'),
      two = audioCacheKey(cfg, 'two', 'wav'),
      three = audioCacheKey(cfg, 'three', 'wav');
    expect(audioCacheKey(cfg, 'one   two', 'wav')).toBe(audioCacheKey(cfg, 'one two', 'wav'));
    expect(audioCacheKey({ ...cfg, voice: 'changed' }, 'one', 'wav')).not.toBe(one);
    cache.put(one, new Uint8Array(4));
    cache.put(two, new Uint8Array(4));
    utimesSync(join(dir, one + '.audio'), new Date(100), new Date(100));
    cache.put(three, new Uint8Array(4));
    expect(cache.size).toBe(8);
    expect(cache.get(one)).toBeNull();
    expect(cache.get(two)?.length).toBe(4);
    const smaller = new AudioCache(dir, 4);
    expect(smaller.size).toBe(4);
    expect(() => cache.get('../outside')).toThrow('Invalid cache key');
    smaller.clear();
    expect(smaller.size).toBe(0);
  });
  it('invalidates cached content after provider/voice or synthesis endpoint/model/pitch changes across restart', () => {
    const dir = directory(),
      cache = new AudioCache(dir),
      cfg = defaults().tts,
      key = audioCacheKey(cfg, 'one', 'wav');
    cache.scope(cfg);
    cache.put(key, new Uint8Array([1, 2]));
    const restarted = new AudioCache(dir);
    restarted.scope(cfg);
    expect(restarted.get(key)?.length).toBe(2);
    restarted.scope({ ...cfg, model: 'changed' });
    expect(restarted.size).toBe(0);
    restarted.put(key, new Uint8Array([1, 2]));
    restarted.scope({ ...cfg, voice: 'changed' });
    expect(restarted.size).toBe(0);
  });
});
describe('speech providers', () => {
  it('none emits nothing and allocates no audio or network request', async () => {
    const provider = new NoneTTSProvider();
    expect(await provider.listVoices()).toEqual([]);
    const chunks = [];
    for await (const chunk of provider.synthesize()) chunks.push(chunk);
    expect(chunks).toEqual([]);
  });
  it('streams exact compatible requests, maps PCM and omits optional local authorization', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3, 4]));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'audio/pcm' } },
        ),
    );
    const cfg = { ...defaults().tts, baseUrl: 'http://localhost:9999/v1', model: 'local-speech' };
    const provider = new OpenAICompatibleTTSProvider(cfg, async () => undefined, fetcher);
    const chunks = [];
    for await (const chunk of provider.synthesize('Text only', {
      signal: new AbortController().signal,
      voice: 'voice',
      speed: 1.2,
      format: 'pcm16',
    }))
      chunks.push([...chunk]);
    expect(chunks).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const request = fetcher.mock.calls[0];
    expect(String(request?.[0])).toBe('http://localhost:9999/v1/audio/speech');
    expect(request?.[1]?.redirect).toBe('error');
    expect(new Headers(request?.[1]?.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      model: 'local-speech',
      input: 'Text only',
      voice: 'voice',
      speed: 1.2,
      response_format: 'pcm',
    });
  });
  it('rejects authentication without echoing response secrets, and stops before an aborted request', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('private key echoed by server', { status: 401 }),
    );
    const provider = new OpenAICompatibleTTSProvider(
      defaults().tts,
      async () => 'private-key',
      fetcher,
    );
    const opts = { signal: new AbortController().signal, voice: 'alloy', speed: 1, format: 'mp3' };
    await expect(provider.synthesize('hello', opts).next()).rejects.toMatchObject({
      normalized: { code: 'AUTH_INVALID' },
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer private-key',
    );
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      provider.synthesize('hello', { ...opts, signal: aborted.signal }).next(),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
