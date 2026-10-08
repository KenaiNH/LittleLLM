import { z } from 'zod';
import type { Config } from '../../shared/config';
import type { STTProvider } from './types';
import { endpoint, boundedJson } from '../llm/http';
import { ProviderError } from '../llm/errors';
export class OpenAICompatibleSTTProvider implements STTProvider {
  id = 'openai-compatible-stt';
  requiresApiKey = false;
  streaming = false;
  private lifetime = new AbortController();
  constructor(
    private config: Config['stt'],
    private key: () => Promise<string | undefined>,
  ) {}
  async transcribe(clip: Uint8Array, opts: Parameters<NonNullable<STTProvider['transcribe']>>[1]) {
    if (clip.length > 32 * 1024 * 1024 + 44) throw new Error('Recording exceeds the audio budget.');
    const signal = AbortSignal.any([
      opts.signal,
      this.lifetime.signal,
      AbortSignal.timeout(120000),
    ]);
    signal.throwIfAborted();
    const body = new FormData();
    body.set('file', new Blob([Uint8Array.from(clip)], { type: opts.mimeType }), 'recording.wav');
    body.set('model', this.config.model);
    body.set('response_format', 'json');
    if (opts.language !== 'auto') body.set('language', opts.language);
    if (opts.prompt) body.set('prompt', opts.prompt);
    const key = await this.key();
    signal.throwIfAborted();
    const response = await fetch(endpoint(this.config.baseUrl, '/audio/transcriptions'), {
      method: 'POST',
      body,
      signal,
      redirect: 'error',
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError({
        code:
          response.status === 401 || response.status === 403
            ? 'AUTH_INVALID'
            : response.status === 404
              ? 'MODEL_NOT_FOUND'
              : response.status === 429
                ? 'RATE_LIMITED'
                : response.status >= 500
                  ? 'SERVER_ERROR'
                  : 'INVALID_RESPONSE',
        userMessage:
          response.status === 401 || response.status === 403
            ? 'The transcription server rejected the saved API key.'
            : response.status === 404
              ? 'The transcription model or endpoint was not found. Check Voice Input settings.'
              : response.status === 429
                ? 'The transcription server is busy or has reached its usage limit.'
                : 'The transcription server could not complete the recording.',
        retryable: response.status === 429 || response.status >= 500,
        action: { label: 'Voice Input settings', kind: 'open-settings' },
      });
    }
    const result = z
      .object({
        text: z.string().max(32000),
        confidence: z.number().min(0).max(1).optional(),
        duration: z.number().nonnegative().optional(),
        language: z.string().max(64).optional(),
      })
      .parse(await boundedJson(response));
    return {
      text: result.text,
      isFinal: true,
      confidence: result.confidence,
      durationMs: result.duration === undefined ? undefined : result.duration * 1000,
      language: result.language,
    };
  }
  dispose() {
    this.lifetime.abort();
  }
}
