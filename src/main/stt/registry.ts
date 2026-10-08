import type { Config } from '../../shared/config';
import type { STTProvider } from './types';
export async function createSTTProvider(
  config: Config['stt'],
  key: () => Promise<string | undefined>,
): Promise<STTProvider> {
  if (config.provider === 'none')
    return {
      id: 'none',
      requiresApiKey: false,
      streaming: false,
      transcribe: async () => ({ text: '', isFinal: true }),
      dispose() {},
    };
  if (config.provider === 'openai-compatible-stt') {
    const { OpenAICompatibleSTTProvider } = await import('./openaiCompatible');
    return new OpenAICompatibleSTTProvider(config, key);
  }
  throw new Error('This voice input provider is not implemented yet.');
}
