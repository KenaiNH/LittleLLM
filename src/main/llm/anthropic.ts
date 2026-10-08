import { z } from 'zod';
import type { Config } from '../../shared/config';
import type { ChatDelta, ChatMessage, ChatOptions, LLMProvider, ModelInfo } from './types';
import { parseSse } from './streamParser';
import { httpError, providerError, ProviderError } from './errors';
import { endpoint, requestHeaders, boundedJson, fetchWithReset } from './http';
import { anthropicMessages } from './imageEncoding';
const count = z.number().int().nonnegative();
const eventSchema = z.object({
  type: z.string(),
  message: z.object({ usage: z.object({ input_tokens: count, output_tokens: count }) }).optional(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      stop_reason: z.string().nullable().optional(),
    })
    .optional(),
  usage: z.object({ output_tokens: count }).optional(),
});
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly supportsImages = true;
  constructor(
    private config: Config['llm'],
    private getKey: () => Promise<string | undefined> = async () => undefined,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async headers() {
    const key = await this.getKey();
    if (new URL(this.config.baseUrl).hostname === 'api.anthropic.com' && !key)
      throw new ProviderError({
        code: 'AUTH_MISSING',
        userMessage: 'Add your Anthropic API key in Model settings.',
        retryable: false,
        action: { label: 'Model settings', kind: 'open-settings' },
      });
    return requestHeaders(this.config, key, {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(key ? { 'x-api-key': key } : {}),
    });
  }
  async listModels(): Promise<ModelInfo[]> {
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    try {
      const url = endpoint(this.config.baseUrl, '/v1/models'),
        headers = await this.headers(),
        models: ModelInfo[] = [],
        cursors = new Set<string>();
      url.searchParams.set('limit', '1000');
      for (;;) {
        const response = await fetchWithReset(
          this.fetcher,
          url,
          { headers, signal },
          this.config.retryAttempts,
        );
        if (!response.ok)
          throw httpError(response.status, await boundedJson(response).catch(() => undefined));
        const page = z
          .object({
            data: z
              .array(
                z.object({
                  id: z.string().min(1).max(200),
                  display_name: z.string().max(200).optional(),
                }),
              )
              .max(10000),
            has_more: z.boolean().default(false),
            last_id: z.string().nullable().optional(),
          })
          .parse(await boundedJson(response));
        models.push(
          ...page.data.map((item) => ({
            id: item.id,
            name: item.display_name ?? item.id,
            supportsImages: null,
          })),
        );
        if (models.length > 10000) throw new Error('Model list exceeds limit');
        if (!page.has_more) return models;
        if (!page.last_id || cursors.has(page.last_id)) throw new Error('Invalid model pagination');
        cursors.add(page.last_id);
        url.searchParams.set('after_id', page.last_id);
      }
    } catch (error) {
      throw new ProviderError(providerError(error, this.config.baseUrl, signal));
    }
  }
  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncIterable<ChatDelta> {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(this.config.timeoutMs)]);
    try {
      const response = await fetchWithReset(
        this.fetcher,
        endpoint(this.config.baseUrl, '/v1/messages'),
        {
          method: 'POST',
          signal,
          headers: await this.headers(),
          body: JSON.stringify({
            model: options.model,
            messages: anthropicMessages(messages),
            ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
            stream: options.stream !== false,
            max_tokens: options.maxTokens ?? this.config.maxTokens,
            ...((options.topP ?? this.config.topP) !== 1
              ? { top_p: options.topP ?? this.config.topP }
              : { temperature: options.temperature ?? this.config.temperature }),
            ...((options.stopSequences ?? this.config.stopSequences).length
              ? { stop_sequences: options.stopSequences ?? this.config.stopSequences }
              : {}),
          }),
        },
        this.config.retryAttempts,
      );
      if (!response.ok)
        throw httpError(response.status, await boundedJson(response).catch(() => undefined));
      if (options.stream === false) {
        const result = z
          .object({
            content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
            stop_reason: z.string().nullable(),
            usage: z.object({ input_tokens: count, output_tokens: count }),
          })
          .parse(await boundedJson(response));
        if (result.stop_reason === 'refusal') throw httpError(400, { error: 'content_filter' });
        for (const block of result.content)
          if (block.type === 'text' && block.text) yield { type: 'text', text: block.text };
        yield {
          type: 'done',
          usage: {
            promptTokens: result.usage.input_tokens,
            completionTokens: result.usage.output_tokens,
            totalTokens: result.usage.input_tokens + result.usage.output_tokens,
          },
        };
        return;
      }
      if (!response.body) throw new Error('Missing stream');
      let input = 0,
        output = 0,
        started = false;
      for await (const record of parseSse(response.body, signal)) {
        const raw: unknown = JSON.parse(record);
        if (raw && typeof raw === 'object' && 'error' in raw) {
          const overloaded = JSON.stringify(raw).includes('overloaded_error');
          throw httpError(overloaded ? 503 : 400, raw);
        }
        const event = eventSchema.parse(raw);
        if (event.type === 'message_start') {
          if (!event.message) throw new Error('Missing message');
          started = true;
          input = event.message.usage.input_tokens;
          output = event.message.usage.output_tokens;
        }
        if (!started && event.type !== 'ping') throw new Error('Missing message start');
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta.text
        )
          yield { type: 'text', text: event.delta.text };
        if (event.type === 'message_delta') {
          if (event.delta?.stop_reason === 'refusal')
            throw httpError(400, { error: 'content_filter' });
          if (event.usage) output = event.usage.output_tokens;
        }
        if (event.type === 'message_stop') {
          yield {
            type: 'done',
            usage: { promptTokens: input, completionTokens: output, totalTokens: input + output },
          };
          return;
        }
      }
      throw new Error('Stream ended without message stop');
    } catch (error) {
      yield { type: 'error', error: providerError(error, this.config.baseUrl, signal) };
    }
  }
}
