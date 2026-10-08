import type { ChatImage } from '../../shared/attachments';
export type ChatMessage = { role: 'user' | 'assistant'; content: string; images?: ChatImage[] };
export type { ChatDelta, ModelInfo } from '../../shared/llm';
import type { ChatDelta, ModelInfo } from '../../shared/llm';
export type ChatOptions = {
  signal: AbortSignal;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
};
export interface LLMProvider {
  id: string;
  supportsImages: boolean;
  imageSupport?(model: string): Promise<boolean | null>;
  listModels?(): Promise<ModelInfo[]>;
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatDelta>;
}
