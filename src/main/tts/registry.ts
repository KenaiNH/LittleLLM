import type { Config } from '../../shared/config';
import type { TTSProvider } from './types';
import { NoneTTSProvider } from './providers/none';
export async function createTTSProvider(
  config: Config['tts'],
  key: () => Promise<string | undefined>,
): Promise<TTSProvider> {
  if (config.provider === 'none') return new NoneTTSProvider();
  if (config.provider === 'windows-sapi') {
    const { WindowsSapiProvider } = await import('./providers/windowsSapi');
    return new WindowsSapiProvider(config);
  }
  if (config.provider === 'openai-compatible-tts') {
    const { OpenAICompatibleTTSProvider } = await import('./providers/openaiCompatibleTts');
    return new OpenAICompatibleTTSProvider(config, key);
  }
  if (config.provider === 'elevenlabs') {
    const { ElevenLabsTTSProvider } = await import('./providers/elevenlabs');
    return new ElevenLabsTTSProvider(config, key);
  }
  if (config.provider === 'custom-http') {
    const { CustomHttpTTSProvider } = await import('./providers/customHttp');
    return new CustomHttpTTSProvider(config, key);
  }
  throw new Error('This speech provider is not implemented.');
}
