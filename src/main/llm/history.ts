import type { ChatMessage } from './types';
import type { Config } from '../../shared/config';
export type Exchange = { user: string; assistant: string };
export function estimateTokens(text: string): number {
  let cjk = 0,
    other = 0;
  for (const char of text) {
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char)) cjk++;
    else other++;
  }
  return Math.ceil(cjk / 1.5 + other / 3.6);
}
export function historyMessages(
  exchanges: Exchange[],
  current: string,
  config: Config['llm'],
  system: string,
  examples: ChatMessage[] = [],
): ChatMessage[] {
  const count =
    config.contextMode === 'none'
      ? 0
      : config.contextMode.startsWith('last')
        ? Number(config.contextMode.slice(4))
        : exchanges.length;
  const retained = count ? exchanges.slice(-count) : [];
  if (config.contextMode === 'token-budget') {
    const fixed =
      estimateTokens(system) +
      estimateTokens(current) +
      examples.reduce((sum, item) => sum + estimateTokens(item.content), 0);
    let used =
      fixed +
      retained.reduce(
        (sum, item) => sum + estimateTokens(item.user) + estimateTokens(item.assistant),
        0,
      );
    while (retained.length && used > config.tokenBudget) {
      const removed = retained.shift();
      if (removed) used -= estimateTokens(removed.user) + estimateTokens(removed.assistant);
    }
  }
  return [
    ...examples,
    ...retained.flatMap((item) => [
      { role: 'user' as const, content: item.user },
      { role: 'assistant' as const, content: item.assistant },
    ]),
    { role: 'user', content: current },
  ];
}
