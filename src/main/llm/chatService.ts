import { randomUUID } from 'node:crypto';
import type { Config } from '../../shared/config';
import { chatDeltaSchema, type ChatDelta, type ChatEvent } from '../../shared/llm';
import type { LLMProvider } from './types';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { MockLLMProvider, MOCK_FIXTURES } from '../testing/mockProviders';
import { historyMessages, type Exchange } from './history';
import { buildSystemPrompt } from './persona';
import { ProviderError, providerError } from './errors';
type Active = { id: string; controller: AbortController; terminal: boolean };
export class ChatService {
  private active: Active | null = null;
  private exchanges: Exchange[] = [];
  private lastPrompt: string | null = null;
  private lastCompleted = false;
  constructor(
    private getConfig: () => Config,
    private emit: (event: ChatEvent) => void,
    private getKey: () => Promise<string | undefined> = async () => undefined,
    private makeProvider?: (config: Config) => LLMProvider,
  ) {}
  start(text: string, regenerate = false): string {
    this.abort();
    const cfg = this.getConfig();
    if (regenerate) {
      if (!this.lastPrompt) throw new Error('No prompt to regenerate');
      text = this.lastPrompt;
      if (this.lastCompleted) this.exchanges.pop();
    } else this.lastPrompt = text;
    this.lastCompleted = false;
    const active = { id: randomUUID(), controller: new AbortController(), terminal: false };
    this.active = active;
    // Start after the invoke response so renderers can subscribe by request ID.
    setImmediate(() => void this.run(active, text, cfg));
    return active.id;
  }
  regenerate() {
    return this.start('', true);
  }
  abort(id?: string) {
    const active = this.active;
    if (!active || (id && id !== active.id)) return;
    active.controller.abort();
    this.send(active, {
      type: 'error',
      error: { code: 'ABORTED', userMessage: 'Cancelled', retryable: false },
    });
    this.active = null;
  }
  clear() {
    this.abort();
    this.exchanges = [];
    this.lastPrompt = null;
    this.lastCompleted = false;
  }
  private send(active: Active, delta: ChatDelta) {
    if (active.terminal) return;
    if (delta.type !== 'text') active.terminal = true;
    this.emit({ requestId: active.id, delta: chatDeltaSchema.parse(delta) });
  }
  private provider(cfg: Config): LLMProvider {
    if (this.makeProvider) return this.makeProvider(cfg);
    if (cfg.llm.provider === 'mock') {
      if (!cfg.advanced.developerMode)
        throw new ProviderError({
          code: 'INVALID_RESPONSE',
          userMessage: 'The test provider requires Developer Mode.',
          retryable: false,
        });
      const fixture =
        cfg.llm.model in MOCK_FIXTURES ? (cfg.llm.model as keyof typeof MOCK_FIXTURES) : 'short';
      return new MockLLMProvider(fixture, cfg.llm.mockReplySpeed);
    }
    if (cfg.llm.provider !== 'openai-compatible')
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        userMessage: 'This model provider is not available yet. Choose OpenAI-compatible.',
        retryable: false,
      });
    return new OpenAICompatibleProvider(cfg.llm, this.getKey);
  }
  private async run(active: Active, text: string, cfg: Config) {
    let reply = '';
    try {
      active.controller.signal.throwIfAborted();
      const provider = this.provider(cfg),
        system = buildSystemPrompt(cfg).text,
        messages = historyMessages(this.exchanges, text, cfg.llm, system);
      for await (const raw of provider.chat(messages, {
        signal: active.controller.signal,
        model: cfg.llm.model,
        systemPrompt: system,
        temperature: cfg.llm.temperature,
        topP: cfg.llm.topP,
        maxTokens: cfg.llm.maxTokens,
        stopSequences: cfg.llm.stopSequences,
        stream: cfg.llm.stream,
      })) {
        if (active.terminal || active.controller.signal.aborted) return;
        const delta = chatDeltaSchema.parse(raw);
        if (delta.type === 'text') {
          reply += delta.text;
          if (reply.length > 512000) throw new Error('Reply exceeds display budget');
        }
        if (delta.type === 'done') {
          if (reply) {
            this.exchanges.push({ user: text, assistant: reply });
            this.lastCompleted = true;
          }
          this.send(active, delta);
          return;
        }
        this.send(active, delta);
        if (delta.type === 'error') return;
      }
      if (!active.terminal) throw new Error('Provider ended without terminal event');
    } catch (error) {
      this.send(active, {
        type: 'error',
        error: providerError(error, cfg.llm.baseUrl, active.controller.signal),
      });
    } finally {
      if (this.active === active) this.active = null;
    }
  }
}
