import type { Config } from './config';

const variables = /{{(text|voice|speed)}}/g;
export function speechBody(template: string, text: string, voice: string, speed: number): string {
  if (!template.includes('{{text}}')) throw new Error('The body template must contain {{text}}.');
  const values = { text, voice, speed };
  // Process complete JSON string tokens before placeholders outside strings. User text is data.
  const body = template.replace(
    /"(?:\\.|[^"\\])*"|{{(text|voice|speed)}}/g,
    (token, name: string) => {
      if (token.startsWith('"')) {
        const string = JSON.parse(token) as string;
        if (/{{(?!(?:text|voice|speed)}})[^}]*}}/.test(string))
          throw new Error('Use only {{text}}, {{voice}} and {{speed}} in the body template.');
        return JSON.stringify(
          string.replace(variables, (_match, key: keyof typeof values) => String(values[key])),
        );
      }
      return JSON.stringify(values[name as keyof typeof values]);
    },
  );
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('The body template must be a JSON object.');
  return body;
}

export function applyTTSFields(current: Config['tts'], changes: Record<string, unknown>) {
  const next = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    const [parent, child, extra] = key.split('.');
    if (!parent || ['__proto__', 'constructor', 'prototype'].includes(parent))
      throw new Error('Unsupported voice field.');
    if (!child) next[parent] = value;
    else if (
      !extra &&
      (parent === 'elevenlabs' || parent === 'custom') &&
      !['__proto__', 'constructor', 'prototype'].includes(child)
    )
      next[parent] = { ...(next[parent] as Record<string, unknown>), [child]: value };
    else throw new Error('Unsupported voice field.');
  }
  return next;
}

export function synthesisScope(config: Config['tts']) {
  return JSON.stringify([
    config.provider,
    config.voice,
    config.baseUrl,
    config.model,
    config.pitch,
    config.format,
    config.elevenlabs,
    config.custom,
  ]);
}
