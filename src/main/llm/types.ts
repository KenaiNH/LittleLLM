export type ChatMessage = { role: 'user' | 'assistant'; content: string };
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
  listModels?(): Promise<ModelInfo[]>;
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatDelta>;
}
