import { randomUUID } from 'node:crypto';
import type { Config } from '../../shared/config';
import { chatDeltaSchema, type ChatDelta, type ChatEvent } from '../../shared/llm';
import type { LLMProvider } from './types';
import { createLLMProvider } from './registry';
import { historyMessages, type Exchange } from './history';
import {
  buildSystemPrompt,
  currentPersonaContext,
  personaExamples,
  type PersonaContext,
} from './persona';
import { providerError } from './errors';
import type { ConversationStore } from '../services/conversationStore';
import type { ChatImage } from '../../shared/attachments';
import { imageCapability } from './capabilities';
import { ProviderError } from './errors';
type Active = { id: string; controller: AbortController; terminal: boolean; greeting: boolean };
export class ChatService {
  get hasConversation() {
    return this.exchanges.length > 0 || Boolean(this.active);
  }
  private active: Active | null = null;
  private exchanges: Exchange[] = [];
  private lastPrompt: string | null = null;
  private lastImages: ChatImage[] = [];
  private lastCompleted = false;
  private lastCompletedIndex: number | null = null;
  constructor(
    private getConfig: () => Config,
    private emit: (event: ChatEvent) => void,
    private getKey: () => Promise<string | undefined> = async () => undefined,
    private makeProvider?: (config: Config) => LLMProvider,
    private history?: ConversationStore,
    private personaContext: () => PersonaContext = () => currentPersonaContext(),
  ) {
    if (getConfig().llm.persistence === 'permanent') this.exchanges = history?.load() ?? [];
  }
  persistenceChanged() {
    if (this.getConfig().llm.persistence === 'permanent') this.history?.save(this.exchanges);
  }
  start(
    text: string,
    regenerate = false,
    images: ChatImage[] = [],
    id: string = randomUUID(),
    greeting = false,
  ): string {
    this.abort();
    const cfg = this.getConfig();
    if (regenerate) {
      if (!this.lastPrompt) throw new Error('No prompt to regenerate');
      text = this.lastPrompt;
      images = this.lastImages;
      if (this.lastCompleted && this.lastCompletedIndex !== null)
        this.exchanges.splice(this.lastCompletedIndex, 1);
    } else if (!greeting) {
      this.lastPrompt = text;
      this.lastImages = images;
    }
    if (!greeting) this.lastCompleted = false;
    const active = { id, controller: new AbortController(), terminal: false, greeting };
    this.active = active;
    // Start after the invoke response so renderers can subscribe by request ID.
    setImmediate(() => void this.run(active, text, cfg, images));
    return active.id;
  }
  regenerate() {
    return this.start('', true);
  }
  startGreeting(prompt: string, id: string) {
    return this.start(prompt, false, [], id, true);
  }
  addGreeting(text: string) {
    this.exchanges.push({ assistant: text });
    if (this.getConfig().llm.persistence === 'permanent') this.history?.save(this.exchanges);
  }
  abort(id?: string) {
    const active = this.active;
    if (!active || (id && id !== active.id)) return;
    // A terminal-event listener may synchronously start a queued replacement turn.
    this.active = null;
    active.controller.abort();
    this.send(active, {
      type: 'error',
      error: { code: 'ABORTED', userMessage: 'Cancelled', retryable: false },
    });
  }
  clear() {
    this.abort();
    this.history?.clear();
    this.exchanges = [];
    this.lastPrompt = null;
    this.lastImages = [];
    this.lastCompleted = false;
    this.lastCompletedIndex = null;
  }
  private send(active: Active, delta: ChatDelta) {
    if (active.terminal) return;
    if (delta.type !== 'text') active.terminal = true;
    this.emit({ requestId: active.id, delta: chatDeltaSchema.parse(delta) });
  }
  private provider(cfg: Config): LLMProvider {
    if (this.makeProvider) return this.makeProvider(cfg);
    return createLLMProvider(cfg, this.getKey);
  }
  private async run(active: Active, text: string, cfg: Config, images: ChatImage[]) {
    let reply = '';
    try {
      active.controller.signal.throwIfAborted();
      const provider = this.provider(cfg);
      if (images.length > cfg.llm.maxAttachments) {
        throw new ProviderError({
          code: 'INVALID_RESPONSE',
          userMessage: 'Too many attachments for this message.',
          retryable: false,
        });
      }
      const system = buildSystemPrompt(cfg, this.personaContext()).text,
        messages = historyMessages(
          this.exchanges,
          text,
          cfg.llm,
          system,
          personaExamples(cfg),
          images,
        );
      if (messages.some((message) => message.images?.length)) {
        const capability = await imageCapability(cfg, provider);
        if (!capability.allowed)
          throw new ProviderError({
            code: 'INVALID_RESPONSE',
            userMessage: capability.reason + ' Clear the conversation to remove earlier images.',
            retryable: false,
          });
      }
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
            this.exchanges.push({
              ...(!active.greeting ? { user: text } : {}),
              assistant: reply,
              ...(images.length ? { images } : {}),
            });
            if (!active.greeting) {
              this.lastCompleted = true;
              this.lastCompletedIndex = this.exchanges.length - 1;
            }
            if (
              cfg.llm.persistence === 'permanent' &&
              this.getConfig().llm.persistence === 'permanent'
            )
              this.history?.save(this.exchanges);
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
