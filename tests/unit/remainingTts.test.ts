import { describe, it, expect, vi } from 'vitest';
import { defaults, ttsSchema } from '../../src/shared/config';
import { speechBody, applyTTSFields } from '../../src/shared/ttsCustom';
import { ElevenLabsTTSProvider } from '../../src/main/tts/providers/elevenlabs';
import {
  CustomHttpTTSProvider,
  jsonField,
  base64Audio,
} from '../../src/main/tts/providers/customHttp';
const opts = () => ({
  signal: new AbortController().signal,
  voice: 'a voice',
  speed: 1.5,
  format: 'pcm16',
});
async function collect(
  provider: ElevenLabsTTSProvider | CustomHttpTTSProvider,
  text = 'Text',
  options = opts(),
) {
  const result: number[] = [];
  for await (const bytes of provider.synthesize(text, options)) result.push(...bytes);
  return result;
}
const audio = () =>
  new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } });
describe('voice templates and settings', () => {
  it('treats text as JSON data, supports embedded variables and numeric speed without eval', () => {
    const text = 'Quote "\nbackslash \\ {{voice}} $(code)';
    expect(
      JSON.parse(
        speechBody(
          '{"utterance":"Say {{text}}", "voice":"{{voice}}", "speed":{{speed}}}',
          text,
          'Voice"',
          1.5,
        ),
      ),
    ).toEqual({ utterance: 'Say ' + text, voice: 'Voice"', speed: 1.5 });
    for (const template of [
      '{"a":1}',
      '{bad {{text}}}',
      '[]',
      '{"text":"{{text}}","key":"{{apiKey}}"}',
    ])
      expect(() => speechBody(template, text, '', 1)).toThrow();
    expect(ttsSchema.safeParse({ custom: { bodyTemplate: '{bad}' } }).success).toBe(false);
  });
  it('patches multiple nested siblings atomically and rejects unsafe paths and literal credentials', () => {
    const cfg = defaults().tts;
    const changed = ttsSchema.parse(
      applyTTSFields(cfg, {
        'elevenlabs.stability': 0.2,
        'elevenlabs.style': 0.8,
        'custom.method': 'GET',
      }),
    );
    expect(changed.elevenlabs).toEqual({ ...cfg.elevenlabs, stability: 0.2, style: 0.8 });
    expect(changed.custom.bodyTemplate).toBe(cfg.custom.bodyTemplate);
    for (const key of ['custom.__proto__', 'custom.headers.secret', 'constructor', '__proto__.x'])
      expect(() => applyTTSFields(cfg, { [key]: 1 })).toThrow();
    expect(
      ttsSchema.safeParse({ custom: { headers: { Authorization: 'Bearer literal-secret' } } })
        .success,
    ).toBe(false);
    expect(
      ttsSchema.safeParse({ custom: { headers: { Authorization: 'Bearer {{apiKey}}' } } }).success,
    ).toBe(true);
  });
});
describe('ElevenLabs protocol', () => {
  it('enumerates voices and streams MP3 with the exact model/settings and main-only key', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/voices')
        ? Response.json({ voices: [{ voice_id: 'voice-id', name: 'Voice' }] })
        : audio(),
    );
    const cfg = defaults().tts;
    cfg.elevenlabs.voiceId = 'voice-id';
    cfg.elevenlabs.style = 0.4;
    const provider = new ElevenLabsTTSProvider(cfg, async () => 'private-key', fetcher);
    expect(await provider.listVoices()).toEqual([{ id: 'voice-id', name: 'Voice' }]);
    expect(await collect(provider)).toEqual([1, 2, 3, 4]);
    const call = fetcher.mock.calls[1];
    expect(String(call?.[0])).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-id/stream?output_format=mp3_44100_128',
    );
    expect(new Headers(call?.[1]?.headers).get('xi-api-key')).toBe('private-key');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      text: 'Text',
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
        use_speaker_boost: true,
        speed: 1.5,
      },
    });
    expect(call?.[1]?.redirect).toBe('error');
  });
  it('rejects a missing key and cancels before network I/O', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => audio());
    const provider = new ElevenLabsTTSProvider(defaults().tts, async () => undefined, fetcher);
    await expect(collect(provider)).rejects.toMatchObject({ normalized: { code: 'AUTH_MISSING' } });
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(provider, 'Text', { ...opts(), signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('Custom HTTP protocol', () => {
  const config = () => {
    const cfg = defaults().tts;
    cfg.custom.url = 'http://localhost:9000/speak';
    return cfg;
  };
  it('streams binary POST audio with safe placeholders and optional key headers', async () => {
    const cfg = config();
    cfg.custom.headers = { Authorization: 'Bearer {{apiKey}}' };
    const fetcher = vi.fn<typeof fetch>(async () => audio());
    const provider = new CustomHttpTTSProvider(cfg, async () => 'secret', fetcher);
    expect(await collect(provider, 'Quote "\n')).toEqual([1, 2, 3, 4]);
    const call = fetcher.mock.calls[0];
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ text: 'Quote "\n' });
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer secret');
  });
  it('encodes GET fields as query data and reads base64 from a nested array path', async () => {
    const cfg = config();
    cfg.custom.method = 'GET';
    cfg.custom.bodyTemplate = '{"text":"{{text}}","rate":{{speed}}}';
    cfg.custom.responseMode = 'json-base64';
    cfg.custom.jsonPath = 'data.0.audio';
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ data: [{ audio: 'AQIDBA==' }] }),
    );
    expect(
      await collect(new CustomHttpTTSProvider(cfg, async () => undefined, fetcher), 'a & b?'),
    ).toEqual([1, 2, 3, 4]);
    const call = fetcher.mock.calls[0],
      url = new URL(String(call?.[0]));
    expect(url.searchParams.get('text')).toBe('a & b?');
    expect(url.searchParams.get('rate')).toBe('1.5');
    expect(call?.[1]?.body).toBeUndefined();
    expect(new Headers(call?.[1]?.headers).has('Authorization')).toBe(false);
  });
  it('fetches JSON audio URLs with no forwarded credentials and rejects non-HTTP URLs', async () => {
    const cfg = config();
    cfg.custom.responseMode = 'json-url';
    cfg.custom.jsonPath = 'audio';
    cfg.custom.headers = { Authorization: '{{apiKey}}' };
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).includes('/speak')
        ? Response.json({ audio: 'https://cdn.example/audio' })
        : audio(),
    );
    expect(await collect(new CustomHttpTTSProvider(cfg, async () => 'secret', fetcher))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toBeUndefined();
    expect(fetcher.mock.calls[1]?.[1]?.redirect).toBe('error');
    const unsafe = vi.fn<typeof fetch>(async () => Response.json({ audio: 'file:///private.wav' }));
    await expect(
      collect(new CustomHttpTTSProvider(cfg, async () => 'secret', unsafe)),
    ).rejects.toThrow();
    expect(unsafe).toHaveBeenCalledTimes(1);
  });
  it('supports SSE base64 with the Settings JSON field mode', async () => {
    const cfg = config();
    cfg.custom.responseMode = 'json-base64';
    cfg.custom.jsonPath = 'audio';
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response('data: {"audio":"AQI="}\n\ndata: {"audio":"AwQ="}\n\ndata: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    );
    expect(await collect(new CustomHttpTTSProvider(cfg, async () => undefined, fetcher))).toEqual([
      1, 2, 3, 4,
    ]);
  });
  it('rejects unsafe response paths, malformed base64, missing keys, protocol errors and excess audio', async () => {
    for (const path of ['', '__proto__.audio', 'constructor', 'data.missing'])
      expect(() => jsonField({ data: {} }, path)).toThrow();
    expect(() => base64Audio('not audio!')).toThrow();
    const cfg = config();
    cfg.custom.headers = { Authorization: '{{apiKey}}' };
    const fetcher = vi.fn<typeof fetch>(async () => audio());
    await expect(
      collect(new CustomHttpTTSProvider(cfg, async () => undefined, fetcher)),
    ).rejects.toMatchObject({ normalized: { code: 'AUTH_MISSING' } });
    expect(fetcher).not.toHaveBeenCalled();
    const fail = vi.fn<typeof fetch>(async () => new Response('secret details', { status: 401 }));
    await expect(
      collect(new CustomHttpTTSProvider(config(), async () => undefined, fail)),
    ).rejects.toMatchObject({ normalized: { code: 'AUTH_INVALID' } });
    const large = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array(32 * 1024 * 1024 + 1)),
    );
    await expect(
      collect(new CustomHttpTTSProvider(config(), async () => undefined, large)),
    ).rejects.toThrow('budget');
  });
});
