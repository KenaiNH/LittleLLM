import { z } from 'zod';
import type { Config } from '../../../shared/config';
import type { TTSProvider } from '../types';
import { boundedJson, endpoint } from '../../llm/http';
import { ProviderError } from '../../llm/errors';
export const MAX_UTTERANCE_BYTES = 32 * 1024 * 1024;
export class OpenAICompatibleTTSProvider implements TTSProvider {
  id = 'openai-compatible-tts';
  requiresApiKey = false;
  constructor(
    private config: Config['tts'],
    private getKey: () => Promise<string | undefined>,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async headers() {
    const key = await this.getKey();
    return {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    };
  }
  async listVoices() {
    // Local compatible servers may implement this extension. Hosted OpenAI has no voices route.
    const url = endpoint(this.config.baseUrl, '/audio/voices');
    if (url.hostname === 'api.openai.com')
      return [
        'alloy',
        'ash',
        'ballad',
        'coral',
        'echo',
        'fable',
        'onyx',
        'nova',
        'sage',
        'shimmer',
        'verse',
        'marin',
        'cedar',
      ].map((id) => ({ id, name: id }));
    const response = await this.fetcher(url, {
      headers: await this.headers(),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if ([404, 405].includes(response.status)) {
      await response.body?.cancel();
      return [];
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw speechHttpError(response.status);
    }
    const body = z
      .object({
        voices: z
          .array(
            z.union([
              z.string().max(200),
              z.object({ id: z.string().max(200), name: z.string().max(200).optional() }),
            ]),
          )
          .max(1000),
      })
      .parse(await boundedJson(response));
    return body.voices.map((voice) =>
      typeof voice === 'string'
        ? { id: voice, name: voice }
        : { id: voice.id, name: voice.name ?? voice.id },
    );
  }
  async *synthesize(text: string, opts: Parameters<TTSProvider['synthesize']>[1]) {
    const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(60000)]);
    signal.throwIfAborted();
    const response = await this.fetcher(endpoint(this.config.baseUrl, '/audio/speech'), {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: await this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        voice: opts.voice,
        speed: opts.speed,
        response_format: opts.format === 'pcm16' ? 'pcm' : opts.format,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw speechHttpError(response.status);
    }
    if (!response.body || /json|text\//i.test(response.headers.get('content-type') ?? ''))
      throw new Error('The speech server returned no audio.');
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > MAX_UTTERANCE_BYTES)
          throw new Error('Speech exceeds the per-utterance audio budget.');
        if (next.value.length) yield next.value;
      }
      if (!bytes) throw new Error('The speech server returned empty audio.');
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  dispose() {}
}
export function speechHttpError(status: number) {
  return new ProviderError({
    code:
      status === 401 || status === 403
        ? 'AUTH_INVALID'
        : status === 404
          ? 'MODEL_NOT_FOUND'
          : status === 429
            ? 'RATE_LIMITED'
            : status >= 500
              ? 'SERVER_ERROR'
              : 'INVALID_RESPONSE',
    userMessage:
      status === 401 || status === 403
        ? 'The speech server rejected the saved API key.'
        : status === 404
          ? 'The speech model or endpoint was not found. Check Voice settings.'
          : status === 429
            ? 'The speech server is busy or has reached its usage limit.'
            : 'The speech server could not complete synthesis.',
    retryable: status === 429 || status >= 500,
    action: { label: 'Voice settings', kind: 'open-settings' },
  });
}
