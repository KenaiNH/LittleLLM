import { z } from 'zod';
import type { Config } from '../../shared/config';
import type { ChatDelta, ChatMessage, ChatOptions, LLMProvider, ModelInfo } from './types';
import { utf8Lines } from './streamParser';
import { httpError, providerError, ProviderError } from './errors';
import { endpoint, requestHeaders, boundedJson, fetchWithReset } from './http';

const chunkSchema = z.object({
  message: z.object({ content: z.string() }).optional(),
  done: z.boolean(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});
export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly supportsImages = true;
  constructor(
    private config: Config['llm'],
    private getKey: () => Promise<string | undefined> = async () => undefined,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async headers() {
    const key = await this.getKey();
    return requestHeaders(this.config, key, {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    });
  }
  async listModels(): Promise<ModelInfo[]> {
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    try {
      const response = await fetchWithReset(
        this.fetcher,
        endpoint(this.config.baseUrl, '/api/tags'),
        { headers: await this.headers(), signal },
        this.config.retryAttempts,
      );
      if (!response.ok)
        throw httpError(response.status, await boundedJson(response).catch(() => undefined));
      const result = z
        .object({ models: z.array(z.object({ name: z.string().min(1).max(200) })).max(10000) })
        .parse(await boundedJson(response));
      return result.models.map(({ name }) => ({ id: name, name, supportsImages: null }));
    } catch (error) {
      throw new ProviderError(providerError(error, this.config.baseUrl, signal));
    }
  }
  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncIterable<ChatDelta> {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(this.config.timeoutMs)]);
    try {
      const response = await fetchWithReset(
        this.fetcher,
        endpoint(this.config.baseUrl, '/api/chat'),
        {
          method: 'POST',
          signal,
          headers: await this.headers(),
          body: JSON.stringify({
            model: options.model,
            messages: [
              ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
              ...messages,
            ],
            stream: options.stream !== false,
            options: {
              temperature: options.temperature ?? this.config.temperature,
              top_p: options.topP ?? this.config.topP,
              num_predict: options.maxTokens ?? this.config.maxTokens,
              ...((options.stopSequences ?? this.config.stopSequences).length
                ? { stop: options.stopSequences ?? this.config.stopSequences }
                : {}),
            },
          }),
        },
        this.config.retryAttempts,
      );
      if (!response.ok)
        throw httpError(response.status, await boundedJson(response).catch(() => undefined));
      if (!response.body) throw new Error('Missing stream');
      const records =
        options.stream === false
          ? [JSON.stringify(await boundedJson(response))]
          : utf8Lines(response.body, signal);
      for await (const line of records) {
        if (!line.trim()) continue;
        const raw: unknown = JSON.parse(line);
        if (raw && typeof raw === 'object' && 'error' in raw) throw httpError(400, raw);
        const chunk = chunkSchema.parse(raw);
        if (chunk.message?.content) yield { type: 'text', text: chunk.message.content };
        if (chunk.done) {
          const usage =
            chunk.prompt_eval_count !== undefined && chunk.eval_count !== undefined
              ? {
                  promptTokens: chunk.prompt_eval_count,
                  completionTokens: chunk.eval_count,
                  totalTokens: chunk.prompt_eval_count + chunk.eval_count,
                }
              : undefined;
          yield { type: 'done', usage };
          return;
        }
      }
      throw new Error('Stream ended without completion');
    } catch (error) {
      yield { type: 'error', error: providerError(error, this.config.baseUrl, signal) };
    }
  }
}
