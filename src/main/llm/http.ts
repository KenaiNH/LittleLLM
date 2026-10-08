import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from '../../shared/config';
import { networkCode, ProviderError } from './errors';

export function endpoint(base: string, path: string): URL {
  const url = new URL(base);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol))
    throw new Error('Invalid endpoint');
  url.pathname = url.pathname.replace(/\/+$/, '') + path;
  url.hash = '';
  return url;
}
export function requestHeaders(
  config: Config['llm'],
  key: string | undefined,
  defaults: Record<string, string>,
): Headers {
  const headers = new Headers(defaults);
  for (const [name, value] of Object.entries(config.customHeaders)) {
    if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(name.toLowerCase()))
      throw new Error('Unsupported header');
    if (value.includes('{{apiKey}}') && !key)
      throw new ProviderError({
        code: 'AUTH_MISSING',
        userMessage: 'A custom request header needs the saved API key.',
        retryable: false,
      });
    headers.set(name, value.replaceAll('{{apiKey}}', key ?? ''));
  }
  return headers;
}
export async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Missing response');
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > 2 * 1024 * 1024) throw new Error('Response exceeds size limit');
      parts.push(next.value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export async function fetchWithReset(
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit & { signal: AbortSignal },
  retries: number,
): Promise<Response> {
  let attempts = 0;
  for (;;) {
    try {
      return await fetcher(url, { ...init, redirect: 'error' });
    } catch (error) {
      if (
        init.signal.aborted ||
        !['ECONNRESET', 'UND_ERR_SOCKET'].includes(networkCode(error) ?? '') ||
        attempts >= Math.min(1, retries)
      )
        throw error;
      await delay(150 * 2 ** attempts++, undefined, { signal: init.signal });
    }
  }
}
