import type { Config } from '../../shared/config';
import type { LLMProvider } from './types';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { MockLLMProvider, MOCK_FIXTURES } from '../testing/mockProviders';
import { ProviderError } from './errors';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
export function createLLMProvider(
  config: Config,
  getKey: () => Promise<string | undefined>,
): LLMProvider {
  if (config.llm.provider === 'openai-compatible')
    return new OpenAICompatibleProvider(config.llm, getKey);
  if (config.llm.provider === 'anthropic') return new AnthropicProvider(config.llm, getKey);
  if (config.llm.provider === 'ollama') return new OllamaProvider(config.llm, getKey);
  if (config.llm.provider === 'mock' && config.advanced.developerMode) {
    const fixture =
      config.llm.model in MOCK_FIXTURES
        ? (config.llm.model as keyof typeof MOCK_FIXTURES)
        : 'short';
    return new MockLLMProvider(fixture, config.llm.mockReplySpeed);
  }
  throw new ProviderError({
    code: 'INVALID_RESPONSE',
    retryable: false,
    userMessage:
      config.llm.provider === 'mock'
        ? 'The test provider requires Developer Mode.'
        : 'This provider is not available yet. Choose OpenAI-compatible.',
  });
}
