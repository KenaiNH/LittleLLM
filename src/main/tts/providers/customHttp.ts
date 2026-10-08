import { httpUrlSchema, type Config } from '../../../shared/config';
import { speechBody } from '../../../shared/ttsCustom';
import type { TTSProvider } from '../types';
import { ProviderError } from '../../llm/errors';
import { parseSse } from '../../llm/streamParser';
import { MAX_UTTERANCE_BYTES, speechHttpError } from './openaiCompatibleTts';
import { audioBytes } from './httpAudio';

export function jsonField(body: unknown, path: string): string {
  const parts = path.split('.');
  if (
    !path ||
    parts.length > 16 ||
    parts.some(
      (key) => !/^[\w-]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key),
    )
  )
    throw new Error('Enter a safe JSON field path, such as data.audio.');
  let value = body;
  for (const key of parts) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error('The speech response does not contain the configured JSON field.');
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== 'string')
    throw new Error('The configured speech response field must contain a string.');
  return value;
}
export function base64Audio(value: string): Uint8Array {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (
    !value.length ||
    value.length > Math.ceil(MAX_UTTERANCE_BYTES / 3) * 4 ||
    value.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value) ||
    (value.indexOf('=') !== -1 && value.indexOf('=') !== value.length - padding) ||
    (value.length / 4) * 3 - padding > MAX_UTTERANCE_BYTES
  )
    throw new Error('The speech response contains invalid or oversized base64 audio.');
  return Buffer.from(value, 'base64');
}
async function audioJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('The speech server returned no response.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > Math.ceil(MAX_UTTERANCE_BYTES / 3) * 4 + 65536)
        throw new Error('The speech JSON response exceeds the audio budget.');
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export class CustomHttpTTSProvider implements TTSProvider {
  id = 'custom-http';
  requiresApiKey = false;
  private lifetime = new AbortController();
  constructor(
    private config: Config['tts'],
    private getKey: () => Promise<string | undefined>,
    private fetcher: typeof fetch = fetch,
  ) {}
  async listVoices() {
    return [];
  }
  async *synthesize(text: string, opts: Parameters<TTSProvider['synthesize']>[1]) {
    const signal = AbortSignal.any([opts.signal, this.lifetime.signal, AbortSignal.timeout(60000)]);
    signal.throwIfAborted();
    const cfg = this.config.custom;
    if (!cfg.url) throw new Error('Enter the Custom HTTP request URL in Voice settings.');
    const url = new URL(httpUrlSchema.parse(cfg.url));
    url.hash = '';
    const body = speechBody(cfg.bodyTemplate, text, opts.voice, opts.speed),
      headers = new Headers(cfg.method === 'POST' ? { 'Content-Type': 'application/json' } : {});
    const key = await this.getKey();
    for (const [name, value] of Object.entries(cfg.headers)) {
      if (
        ['host', 'content-length', 'connection', 'transfer-encoding'].includes(name.toLowerCase())
      )
        throw new Error('Unsupported custom speech header.');
      if (value.includes('{{apiKey}}') && !key)
        throw new ProviderError({
          code: 'AUTH_MISSING',
          userMessage: 'A custom speech header needs the saved API key.',
          retryable: false,
        });
      headers.set(name, value.replaceAll('{{apiKey}}', key ?? ''));
    }
    if (cfg.method === 'GET')
      for (const [name, value] of Object.entries(JSON.parse(body) as Record<string, unknown>))
        url.searchParams.set(name, typeof value === 'string' ? value : JSON.stringify(value));
    const response = await this.fetcher(url, {
      method: cfg.method,
      headers,
      redirect: 'error',
      signal,
      ...(cfg.method === 'POST' ? { body } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw speechHttpError(response.status);
    }
    if (cfg.responseMode === 'binary') {
      yield* audioBytes(response, signal);
      return;
    }
    if (
      cfg.responseMode === 'json-base64' &&
      /text\/event-stream/i.test(response.headers.get('content-type') ?? '')
    ) {
      if (!response.body) throw new Error('Missing speech event stream.');
      let bytes = 0;
      for await (const data of parseSse(response.body, signal)) {
        if (data === '[DONE]') break;
        const chunk = base64Audio(jsonField(JSON.parse(data) as unknown, cfg.jsonPath));
        bytes += chunk.length;
        if (bytes > MAX_UTTERANCE_BYTES)
          throw new Error('Speech exceeds the per-utterance audio budget.');
        yield chunk;
      }
      if (!bytes) throw new Error('The speech server returned empty audio.');
      return;
    }
    const field = jsonField(await audioJson(response, signal), cfg.jsonPath);
    signal.throwIfAborted();
    if (cfg.responseMode === 'json-base64') {
      yield base64Audio(field);
      return;
    }
    const audioURL = new URL(httpUrlSchema.parse(field));
    // Never forward the endpoint's key, cookies or custom headers to an audio URL.
    yield* audioBytes(await this.fetcher(audioURL, { signal, redirect: 'error' }), signal);
  }
  dispose() {
    this.lifetime.abort();
  }
}
