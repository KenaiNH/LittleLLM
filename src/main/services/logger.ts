import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../../shared/config';
const levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
export function redactLog(value: unknown, redactPrompts: boolean, key = ''): unknown {
  if (/authorization|x-api-key|api.?key|password|secret|encrypted|base64/i.test(key))
    return '[redacted]';
  if (redactPrompts && /prompt|reply|content|text|messages|transcript/i.test(key))
    return '[redacted]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactLog(item, redactPrompts, key));
  if (value instanceof Error)
    return { name: value.name, message: redactLog(value.message, redactPrompts, 'message') };
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 32)
        .map(([name, item]) => [name, redactLog(item, redactPrompts, name)]),
    );
  if (typeof value === 'string')
    return value
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
      .replace(/data:[^\s]+/g, '[redacted blob]')
      .replace(/[A-Za-z0-9+/=_-]{128,}/g, '[redacted blob]')
      .replace(/((?:api[_-]?key|token|password)=)[^&\s]+/gi, '$1[redacted]')
      .slice(0, 4000);
  return value;
}
export class Logger {
  readonly directory: string;
  private file: string;
  constructor(
    directory: string,
    private config: () => Config,
  ) {
    this.directory = join(directory, 'logs');
    mkdirSync(this.directory, { recursive: true });
    this.file = join(this.directory, 'companion.log');
  }
  write(level: keyof typeof levels, event: string, data?: unknown) {
    const cfg = this.config().advanced;
    if (levels[level] > levels[cfg.logLevel]) return;
    try {
      if (existsSync(this.file) && statSync(this.file).size > 2 * 1024 * 1024) {
        if (existsSync(this.file + '.3')) unlinkSync(this.file + '.3');
        for (let index = 2; index >= 1; index--)
          if (existsSync(this.file + '.' + index))
            renameSync(this.file + '.' + index, this.file + '.' + (index + 1));
        renameSync(this.file, this.file + '.1');
      }
      appendFileSync(
        this.file,
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          event,
          data: redactLog(data, cfg.redactPrompts),
        }) + '\n',
        { mode: 0o600 },
      );
    } catch {
      /* Diagnostics must never prevent a message or launch. */
    }
  }
}
