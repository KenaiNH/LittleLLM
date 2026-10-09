import type { Config } from '../../shared/config';
import { estimateTokens } from './history';
import type { ChatMessage } from './types';
import { ProviderError } from './errors';
export type PersonaContext = { date: string; time: string; weekday: string; state: string };
const emptyContext: PersonaContext = { date: '', time: '', weekday: '', state: 'idle' };
export const PERSONA_VARIABLES = [
  'persona.name',
  'user.name',
  'date',
  'time',
  'weekday',
  'app.state',
] as const;
export function currentPersonaContext(state = 'idle', date = new Date()): PersonaContext {
  return {
    date: date.toLocaleDateString('en-US'),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    state,
  };
}
export function activePersona(cfg: Config) {
  return cfg.persona.enabled
    ? cfg.persona.library.find((card) => card.id === cfg.persona.activeId)
    : undefined;
}
export function resolvePersonaText(
  text: string,
  cfg: Config,
  context: PersonaContext = emptyContext,
) {
  const card = activePersona(cfg),
    unknown = new Set<string>();
  const values: Record<string, () => string> = {
    'persona.name': () => card?.name ?? 'Companion',
    'user.name': () => card?.userName || 'there',
    date: () => context.date,
    time: () => context.time,
    weekday: () => context.weekday,
    'app.state': () => context.state,
  };
  const resolved = text.replace(/\{\{([^{}]+)\}\}/g, (literal, name: string) => {
    if (Object.hasOwn(values, name)) return values[name]?.() ?? literal;
    unknown.add(name);
    return literal;
  });
  return { text: resolved, unknown: [...unknown] };
}
export function personaExamples(cfg: Config): ChatMessage[] {
  return (activePersona(cfg)?.exampleDialogue ?? [])
    .filter((row) => row.user.trim() && row.assistant.trim())
    .flatMap((row) => [
      { role: 'user' as const, content: row.user },
      { role: 'assistant' as const, content: row.assistant },
    ]);
}
// Pure assembly: callers provide the request-time context; no provider, clock or I/O here.
export function previewSystemPrompt(cfg: Config, context: PersonaContext = emptyContext) {
  const card = activePersona(cfg),
    base = cfg.llm.systemPrompt,
    unknown = new Set<string>();
  let block = '';
  if (card) {
    const resolve = (text: string) => {
      const result = resolvePersonaText(text, cfg, context);
      result.unknown.forEach((name) => unknown.add(name));
      return result.text.trim();
    };
    const identity = [
      `You are ${card.name}${card.pronouns ? `, ${card.pronouns}` : ''}.`,
      resolve(card.description),
    ]
      .filter(Boolean)
      .join('\n');
    const speech = [
      resolve(card.speechStyle),
      card.replyLength === 'one-two'
        ? 'Keep replies to one or two sentences unless asked for more.'
        : card.replyLength === 'paragraph'
          ? 'Keep replies to a short paragraph at most.'
          : '',
      card.characterBreak === 'always'
        ? 'Stay in character at all times.'
        : card.characterBreak === 'technical'
          ? 'Stay in character, but drop the voice when answering technical or factual questions accurately matters more.'
          : '',
      card.allowRoleplayActions
        ? 'You may include short physical actions in asterisks, e.g. *tilts head*.'
        : 'Do not write physical actions or stage directions.',
    ]
      .filter(Boolean)
      .join('\n');
    block = [
      '# Character\n' + identity,
      speech ? '## How you speak\n' + speech : '',
      card.userNotes.trim()
        ? "## About the person you're talking to\n" + card.userNotes.trim()
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  const text = !card
    ? base
    : (cfg.persona.injection === 'replace'
        ? [block]
        : cfg.persona.injection === 'before'
          ? [block, base]
          : [base, block]
      )
        .filter(Boolean)
        .join('\n\n');
  const examples = personaExamples(cfg),
    greeting = cfg.persona.greeting;
  if (card)
    for (const value of [greeting.text, greeting.prompt])
      resolvePersonaText(value, cfg, context).unknown.forEach((name) => unknown.add(name));
  return {
    text,
    examples,
    estimatedTokens: estimateTokens(text),
    personaTokens:
      estimateTokens(block) +
      examples.reduce((sum, message) => sum + estimateTokens(message.content), 0),
    unknownVariables: [...unknown],
    tooLong: text.length > 16000,
    warning: text.length > 8000,
    historyBudget:
      cfg.llm.tokenBudget -
      estimateTokens(text) -
      examples.reduce((sum, message) => sum + estimateTokens(message.content), 0) -
      cfg.llm.maxTokens,
  };
}
export function buildSystemPrompt(
  cfg: Config,
  context: PersonaContext = emptyContext,
): { text: string; estimatedTokens: number } {
  const result = previewSystemPrompt(cfg, context);
  if (result.tooLong)
    throw new ProviderError({
      code: 'CONTEXT_LENGTH_EXCEEDED',
      userMessage:
        'The assembled system prompt exceeds 16,000 characters. Shorten the prompt or persona in Settings.',
      retryable: false,
      action: { label: 'Persona settings', kind: 'open-settings' },
    });
  return { text: result.text, estimatedTokens: result.estimatedTokens };
}
