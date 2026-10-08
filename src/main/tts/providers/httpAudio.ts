import { speechHttpError, MAX_UTTERANCE_BYTES } from './openaiCompatibleTts';
export async function* audioBytes(response: Response, signal: AbortSignal) {
  if (!response.ok) {
    await response.body?.cancel();
    throw speechHttpError(response.status);
  }
  if (!response.body || /json|text\//i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new Error('The speech server returned no audio.');
  }
  const reader = response.body.getReader();
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > MAX_UTTERANCE_BYTES)
        throw new Error('Speech exceeds the per-utterance audio budget.');
      if (part.value.length) yield part.value;
    }
    if (!total) throw new Error('The speech server returned empty audio.');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
