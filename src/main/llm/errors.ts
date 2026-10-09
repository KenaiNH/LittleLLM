import type { AppError } from '../../shared/errors';
export class ProviderError extends Error {
  constructor(readonly normalized: AppError) {
    super(normalized.userMessage);
  }
}
export function networkCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  const item = error as { code?: unknown; cause?: unknown };
  if (error instanceof Error) {
    const chromium = /net::(ERR_[A-Z_]+)/.exec(error.message)?.[1];
    const codes: Record<string, string> = {
      ERR_CONNECTION_REFUSED: 'ECONNREFUSED',
      ERR_NAME_NOT_RESOLVED: 'ENOTFOUND',
      ERR_CONNECTION_RESET: 'ECONNRESET',
      ERR_CONNECTION_CLOSED: 'ECONNRESET',
      ERR_TIMED_OUT: 'ETIMEDOUT',
      ERR_CONNECTION_TIMED_OUT: 'ETIMEDOUT',
      ERR_CERT_AUTHORITY_INVALID: 'CERT_INVALID',
    };
    if (chromium) return codes[chromium] ?? chromium;
  }
  return typeof item.code === 'string' ? item.code : networkCode(item.cause);
}
export function providerError(error: unknown, baseUrl: string, signal: AbortSignal): AppError {
  if (signal.aborted)
    return signal.reason?.name === 'TimeoutError'
      ? { code: 'TIMEOUT', userMessage: 'The model took too long to respond.', retryable: true }
      : { code: 'ABORTED', userMessage: 'Cancelled', retryable: false };
  if (error instanceof ProviderError) return error.normalized;
  const code = networkCode(error);
  const action = { label: 'Open Settings', kind: 'open-settings' as const };
  if (code === 'CERT_INVALID' || code?.startsWith('ERR_CERT_'))
    return {
      code: 'NETWORK_UNREACHABLE',
      userMessage:
        'The server certificate could not be verified. Check your endpoint and certificate settings.',
      retryable: false,
      action,
    };
  if (code === 'ETIMEDOUT')
    return {
      code: 'TIMEOUT',
      userMessage: 'The model took too long to respond.',
      retryable: true,
      action,
    };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return {
      code: 'DNS_FAILURE',
      action,
      userMessage: 'The model server address could not be found.',
      retryable: true,
    };
  if (code === 'ECONNREFUSED') {
    const url = new URL(baseUrl),
      loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return {
      code: 'CONNECTION_REFUSED',
      action,
      userMessage: loopback
        ? `Nothing is listening at ${url.origin}${url.pathname}. Is your local model container running?`
        : 'The model server refused the connection.',
      retryable: true,
    };
  }
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || error instanceof TypeError)
    return {
      code: 'NETWORK_UNREACHABLE',
      userMessage: 'The connection to the model server was interrupted.',
      retryable: true,
    };
  return {
    code: 'INVALID_RESPONSE',
    userMessage: 'The model server returned an incomplete or unsupported response.',
    retryable: false,
  };
}
export function httpError(status: number, body: unknown): ProviderError {
  const code =
    typeof body === 'object' && body !== null && 'error' in body
      ? JSON.stringify((body as { error: unknown }).error).toLowerCase()
      : '';
  const common = {
    retryable: false,
    action: { label: 'Model settings', kind: 'open-settings' as const },
  };
  if (/context_length|context window|maximum context/.test(code))
    return new ProviderError({
      ...common,
      code: 'CONTEXT_LENGTH_EXCEEDED',
      userMessage:
        'The conversation is longer than this model can accept. Clear it or reduce the history.',
    });
  if (/content_filter|content policy/.test(code))
    return new ProviderError({
      ...common,
      code: 'CONTENT_FILTERED',
      userMessage: 'The model declined this request.',
    });
  if (status === 401 || status === 403)
    return new ProviderError({
      ...common,
      code: 'AUTH_INVALID',
      userMessage: 'The model server rejected the API key. Check the saved key.',
    });
  if (status === 404)
    return new ProviderError({
      ...common,
      code: 'MODEL_NOT_FOUND',
      userMessage: 'The model or chat endpoint was not found. Check the model name and base URL.',
    });
  if (status === 429)
    return new ProviderError({
      code: 'RATE_LIMITED',
      userMessage: 'The model server is busy or has reached its usage limit. Try again later.',
      retryable: true,
    });
  if (status >= 500)
    return new ProviderError({
      code: 'SERVER_ERROR',
      userMessage: 'The model server could not complete the request.',
      retryable: true,
    });
  return new ProviderError({
    ...common,
    code: 'INVALID_RESPONSE',
    userMessage: 'The model server rejected these request settings.',
  });
}
