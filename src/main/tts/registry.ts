import type { Config } from '../../shared/config';
import type { TTSProvider } from './types';
import { NoneTTSProvider } from './providers/none';
export async function createTTSProvider(config: Config['tts'], key: () => Promise<string | undefined>): Promise<TTSProvider> {
  if (config.provider === 'none') return new NoneTTSProvider();
  if (config.provider === 'windows-sapi') {
    const { WindowsSapiProvider } = await import('./providers/windowsSapi');
    return new WindowsSapiProvider(config);
  }
  if (config.provider === 'openai-compatible-tts') {
    const { OpenAICompatibleTTSProvider } = await import('./providers/openaiCompatibleTts');
    return new OpenAICompatibleTTSProvider(config, key);
  }
  throw new Error('This speech provider is not implemented yet.');
}
