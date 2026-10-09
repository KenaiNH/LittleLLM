import type { Config } from './config';
export function applyPersonaFields(current: Config['persona'], changes: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...current };
  for (const [name, value] of Object.entries(changes)) {
    if (name.startsWith('greeting.'))
      next.greeting = { ...(next.greeting as Record<string, unknown>), [name.slice(9)]: value };
    else next[name] = value;
  }
  return next;
}
