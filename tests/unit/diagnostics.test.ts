import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '../../src/shared/config';
import { Logger, redactLog } from '../../src/main/services/logger';
import { diagnosticActionSchema, sessionPatchSchema } from '../../src/shared/diagnostics';
import { networkCode, providerError } from '../../src/main/llm/errors';
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it('redacts keys, credentials and image blobs even with prompt logging enabled', () => {
  const value = {
    Authorization: 'Bearer abc',
    apiKey: 'private',
    messages: [{ content: 'private prompt', image: 'data:image/png;base64,123' }],
    url: 'https://example.com/?token=abc&next=1',
  };
  const redacted = JSON.stringify(redactLog(value, true));
  expect(redacted).not.toContain('abc');
  expect(redacted).not.toContain('private');
  expect(redacted).not.toContain('base64,123');
  expect(JSON.stringify(redactLog(value, false))).toContain('private prompt');
  expect(JSON.stringify(redactLog(value, false))).not.toContain('Bearer abc');
});
it('filters levels live and rotates bounded logs without exposing credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'littlellm-logger-'));
  directories.push(directory);
  const cfg = configSchema.parse({});
  const logger = new Logger(directory, () => cfg);
  logger.write('info', 'ignored');
  logger.write('error', 'request', { apiKey: 'fixture-key', prompt: 'private prompt' });
  let content = readFileSync(join(logger.directory, 'companion.log'), 'utf8');
  expect(content).not.toContain('ignored');
  expect(content).not.toContain('fixture-key');
  expect(content).not.toContain('private prompt');
  cfg.advanced.logLevel = 'trace';
  for (let at = 0; at < 700; at++)
    logger.write('trace', 'bounded', { value: 'payload '.repeat(500) });
  expect(readdirSync(logger.directory)).toContain('companion.log.1');
  content = readFileSync(join(logger.directory, 'companion.log'), 'utf8');
  expect(content.length).toBeLessThan(2 * 1024 * 1024 + 5000);
});
it('rejects arbitrary diagnostic paths and persisted session debug settings', () => {
  expect(
    diagnosticActionSchema.safeParse({ action: 'open-config', path: 'C:\\Windows' }).success,
  ).toBe(false);
  expect(sessionPatchSchema.safeParse({ forceState: 'thinking' }).success).toBe(true);
  expect(
    configSchema.safeParse({ ...configSchema.parse({}), session: { forceState: 'speaking' } })
      .success,
  ).toBe(false);
  for (const value of ['http://proxy:8080', 'socks5://proxy:1080', ''])
    expect(configSchema.safeParse({ advanced: { proxyUrl: value } }).success).toBe(true);
  for (const value of [
    'file:///C:/Windows',
    'http://user:pass@proxy',
    'http://proxy/path',
    'garbage',
  ])
    expect(configSchema.safeParse({ advanced: { proxyUrl: value } }).success).toBe(false);
});
it('normalizes Electron request failures with a settings action and no stack', () => {
  const signal = new AbortController().signal;
  for (const [message, code] of [
    ['ERR_CONNECTION_REFUSED', 'CONNECTION_REFUSED'],
    ['ERR_NAME_NOT_RESOLVED', 'DNS_FAILURE'],
    ['ERR_TIMED_OUT', 'TIMEOUT'],
  ] as const) {
    const error = new Error('net::' + message);
    expect(networkCode(error)).toBeDefined();
    expect(providerError(error, 'http://localhost:9000/v1', signal)).toMatchObject({
      code,
      action: { kind: 'open-settings' },
    });
  }
});
