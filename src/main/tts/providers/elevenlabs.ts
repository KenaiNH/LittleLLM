import { z } from 'zod';
import type { Config } from '../../../shared/config';
import type { TTSProvider } from '../types';
import { boundedJson } from '../../llm/http';
import { ProviderError } from '../../llm/errors';
import { speechHttpError } from './openaiCompatibleTts';
import { audioBytes } from './httpAudio';
export class ElevenLabsTTSProvider implements TTSProvider {
  id = 'elevenlabs';
  requiresApiKey = true;
  private lifetime = new AbortController();
  private defaultVoice = '';
  constructor(
    private config: Config['tts'],
    private getKey: () => Promise<string | undefined>,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async headers() {
    const key = await this.getKey();
    if (!key)
      throw new ProviderError({
        code: 'AUTH_MISSING',
        userMessage: 'Save an ElevenLabs API key in Voice settings first.',
        retryable: false,
      });
    return { 'xi-api-key': key, 'Content-Type': 'application/json' };
  }
  async listVoices() {
    return this.voices(AbortSignal.timeout(10000));
  }
  private async voices(signal: AbortSignal) {
    const response = await this.fetcher('https://api.elevenlabs.io/v1/voices', {
      headers: await this.headers(),
      redirect: 'error',
      signal: AbortSignal.any([signal, this.lifetime.signal]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw speechHttpError(response.status);
    }
    const body = z
      .object({
        voices: z
          .array(z.object({ voice_id: z.string().min(1).max(200), name: z.string().max(200) }))
          .max(1000),
      })
      .parse(await boundedJson(response));
    return body.voices.map(({ voice_id, name }) => ({ id: voice_id, name }));
  }
  async *synthesize(text: string, opts: Parameters<TTSProvider['synthesize']>[1]) {
    const signal = AbortSignal.any([opts.signal, this.lifetime.signal, AbortSignal.timeout(60000)]);
    signal.throwIfAborted();
    const cfg = this.config.elevenlabs;
    let voice = cfg.voiceId || this.defaultVoice;
    if (!voice) this.defaultVoice = voice = (await this.voices(signal))[0]?.id ?? '';
    signal.throwIfAborted();
    if (!voice) throw new Error('No ElevenLabs voice is available. Choose a voice in Settings.');
    const response = await this.fetcher(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: await this.headers(),
        body: JSON.stringify({
          text,
          model_id: cfg.modelId,
          voice_settings: {
            stability: cfg.stability,
            similarity_boost: cfg.similarityBoost,
            style: cfg.style,
            use_speaker_boost: cfg.speakerBoost,
            speed: opts.speed,
          },
        }),
      },
    );
    yield* audioBytes(response, signal);
  }
  dispose() {
    this.lifetime.abort();
  }
}
