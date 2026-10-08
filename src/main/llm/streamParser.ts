// Wire framing only. Provider schemas validate each complete event afterwards.
export async function* utf8Lines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '',
    total = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      total += part.done ? 0 : part.value.length;
      if (total > 16 * 1024 * 1024) throw new Error('Response exceeds wire limit');
      buffer += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error('Stream record exceeds size limit');
      let index: number;
      while ((index = buffer.search(/[\r\n]/)) >= 0) {
        if (buffer[index] === '\r' && index === buffer.length - 1 && !part.done) break;
        const line = buffer.slice(0, index),
          delimiter = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(index + delimiter);
        yield line;
      }
      if (part.done) break;
    }
    if (buffer) yield buffer.replace(/\r$/, '');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  let data: string[] = [],
    size = 0;
  for await (const line of utf8Lines(body, signal)) {
    if (line === '') {
      if (data.length) yield data.join('\n');
      data = [];
      size = 0;
    } else if (line === 'data' || line.startsWith('data:')) {
      const value = line === 'data' ? '' : line.slice(5).replace(/^ /, '');
      size += value.length;
      if (size > 1024 * 1024) throw new Error('SSE event exceeds size limit');
      data.push(value);
    }
  }
  if (data.length) throw new Error('Truncated SSE event');
}
