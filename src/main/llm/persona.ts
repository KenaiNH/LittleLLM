import type { Config } from '../../shared/config';
import { estimateTokens } from './history';
// All provider calls use this accessor (C26). The Persona milestone adds
// card/template assembly here; the disabled path is byte-identical by design.
export function buildSystemPrompt(config: Config): { text: string; estimatedTokens: number } {
  if (config.persona.enabled) throw new Error('Persona assembly is not available yet');
  const text = config.llm.systemPrompt;
  return { text, estimatedTokens: estimateTokens(text) };
}
