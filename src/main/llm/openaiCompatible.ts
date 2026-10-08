import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import type { ChatDelta, ChatMessage, ChatOptions, LLMProvider, ModelInfo } from './types';
import { parseSse } from './streamParser';
import { httpError, networkCode, providerError, ProviderError } from './errors';
import type { Config } from '../../shared/config';

const usage = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .nullable()
  .optional();
const chunkSchema = z.object({
  choices: z.array(
    z.object({
      index: z.number().int().optional(),
      delta: z
        .object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        })
        .optional(),
      message: z
        .object({ content: z.string().nullable(), refusal: z.string().nullable().optional() })
        .optional(),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
  usage,
});
const systemRoles = new Map<string, 'system' | 'developer'>();
function mapUsage(value: z.infer<typeof usage>) {
  return value
    ? {
        promptTokens: value.prompt_tokens,
        completionTokens: value.completion_tokens,
        totalTokens: value.total_tokens,
      }
    : undefined;
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Missing response');
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > 2 * 1024 * 1024) throw new Error('Response exceeds size limit');
      parts.push(next.value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai-compatible';
  readonly supportsImages = true;
  constructor(
    private config: Config['llm'],
    private getKey: () => Promise<string | undefined> = async () => undefined,
    private fetcher: typeof fetch = fetch,
  ) {}
  async listModels(): Promise<ModelInfo[]> {
    const signal = AbortSignal.timeout(this.config.timeoutMs),
      url = new URL(this.config.baseUrl);
    try {
      if (url.username || url.password) throw new Error('Credentials in endpoint URL');
      const key = await this.getKey();
      const headers = new Headers({ Accept: 'application/json' });
      if (key) headers.set('Authorization', `Bearer ${key}`);
      if (url.hostname === 'api.openai.com' && !key)
        throw new ProviderError({
          code: 'AUTH_MISSING',
          userMessage: 'Add an API key, or configure a local model server.',
          retryable: false,
        });
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        if (
          ['host', 'content-length', 'connection', 'transfer-encoding'].includes(name.toLowerCase())
        )
          throw new Error('Unsupported header');
        if (value.includes('{{apiKey}}') && !key)
          throw new ProviderError({
            code: 'AUTH_MISSING',
            userMessage: 'A custom request header needs the saved API key.',
            retryable: false,
          });
        headers.set(name, value.replaceAll('{{apiKey}}', key ?? ''));
      }
      url.pathname = url.pathname.replace(/\/+$/, '') + '/models';
      url.hash = '';
      const response = await this.fetcher(url, { headers, signal, redirect: 'error' });
      if (!response.ok) throw httpError(response.status, false);
      const models = z
        .object({ data: z.array(z.object({ id: z.string().min(1).max(200) })).max(10000) })
        .parse(await boundedJson(response));
      return models.data.map(({ id }) => ({ id, name: id, supportsImages: null }));
    } catch (error) {
      throw new ProviderError(providerError(error, this.config.baseUrl, signal));
    }
  }
  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncIterable<ChatDelta> {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(this.config.timeoutMs)]),
      url = new URL(this.config.baseUrl);
    try {
      if (url.username || url.password)
        throw new ProviderError({
          code: 'AUTH_INVALID',
          userMessage: 'Remove credentials from the base URL and use the API key field.',
          retryable: false,
        });
      const key = await this.getKey();
      signal.throwIfAborted();
      if (url.hostname === 'api.openai.com' && !key)
        throw new ProviderError({
          code: 'AUTH_MISSING',
          userMessage: 'Add an API key in Model settings, or configure a local model server.',
          retryable: false,
          action: { label: 'Model settings', kind: 'open-settings' },
        });
      const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: options.stream === false ? 'application/json' : 'text/event-stream',
      });
      if (key) headers.set('Authorization', `Bearer ${key}`);
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        if (
          ['host', 'content-length', 'connection', 'transfer-encoding'].includes(name.toLowerCase())
        )
          throw new Error('Unsupported header');
        if (value.includes('{{apiKey}}')) {
          if (!key)
            throw new ProviderError({
              code: 'AUTH_MISSING',
              userMessage: 'A custom request header needs the saved API key.',
              retryable: false,
            });
          headers.set(name, value.replaceAll('{{apiKey}}', key));
        } else headers.set(name, value);
      }
      const endpoint = new URL(url.href);
      endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/chat/completions';
      endpoint.hash = '';
      let role = systemRoles.get(url.href) ?? 'system',
        negotiated = false,
        response: Response;
      for (;;) {
        const input = options.systemPrompt
          ? [{ role, content: options.systemPrompt }, ...messages]
          : messages;
        const payload = {
          model: options.model,
          messages: input,
          stream: options.stream !== false,
          temperature: options.temperature ?? this.config.temperature,
          top_p: options.topP ?? this.config.topP,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
          ...((options.stopSequences ?? this.config.stopSequences).length
            ? { stop: options.stopSequences ?? this.config.stopSequences }
            : {}),
        };
        let attempts = 0;
        for (;;) {
          try {
            response = await this.fetcher(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
              signal,
              redirect: 'error',
            });
            break;
          } catch (error) {
            if (
              signal.aborted ||
              !['ECONNRESET', 'UND_ERR_SOCKET'].includes(networkCode(error) ?? '') ||
              attempts >= Math.min(1, this.config.retryAttempts)
            )
              throw error;
            await delay(150 * 2 ** attempts++, undefined, { signal });
          }
        }
        if (response.ok) {
          if (negotiated) systemRoles.set(url.href, role);
          break;
        }
        let body: unknown;
        try {
          body = await boundedJson(response);
        } catch {
          body = undefined;
        }
        const rejection = JSON.stringify(body ?? {}).toLowerCase();
        // Explicit protocol negotiation required by §6.4.5; no generic 4xx retries.
        if (
          response.status === 400 &&
          options.systemPrompt &&
          role === 'system' &&
          !negotiated &&
          /system/.test(rejection) &&
          /unsupported|not support|not allowed/.test(rejection) &&
          /role|messages/.test(rejection)
        ) {
          role = 'developer';
          negotiated = true;
          continue;
        }
        throw httpError(response.status, body);
      }
      if (options.stream === false) {
        const parsed = chunkSchema.parse(await boundedJson(response)),
          choice = parsed.choices.find((item) => item.index === 0) ?? parsed.choices[0];
        if (!choice?.message) throw new Error('Missing assistant message');
        if (choice.message.refusal || choice.finish_reason === 'content_filter')
          throw new ProviderError({
            code: 'CONTENT_FILTERED',
            userMessage: 'The model declined this request.',
            retryable: false,
          });
        if (choice.message.content) yield { type: 'text', text: choice.message.content };
        yield { type: 'done', usage: mapUsage(parsed.usage) };
        return;
      }
      if (!response.body) throw new Error('Missing stream');
      let finished = false,
        received = false,
        lastUsage: z.infer<typeof usage>;
      for await (const record of parseSse(response.body, signal)) {
        if (!record.trim()) continue;
        if (record === '[DONE]') {
          if (!received) throw new Error('Empty completion stream');
          yield { type: 'done', usage: mapUsage(lastUsage) };
          return;
        }
        const raw: unknown = JSON.parse(record);
        if (raw && typeof raw === 'object' && 'error' in raw) throw httpError(400, raw);
        const chunk = chunkSchema.parse(raw);
        received = true;
        if (chunk.usage) lastUsage = chunk.usage;
        const choice = chunk.choices.find((item) => item.index === 0) ?? chunk.choices[0];
        if (!choice) continue;
        if (choice.finish_reason === 'content_filter' || choice.delta?.refusal)
          throw new ProviderError({
            code: 'CONTENT_FILTERED',
            userMessage: 'The model declined this request.',
            retryable: false,
          });
        if (choice.delta?.content) yield { type: 'text', text: choice.delta.content };
        if (choice.finish_reason) finished = true;
      }
      if (!finished) throw new Error('Stream ended without a completion marker');
      yield { type: 'done', usage: mapUsage(lastUsage) };
    } catch (error) {
      yield { type: 'error', error: providerError(error, this.config.baseUrl, signal) };
    }
  }
}
