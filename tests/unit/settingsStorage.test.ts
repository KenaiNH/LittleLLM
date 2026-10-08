import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
vi.mock('electron', () => ({ safeStorage: {} }));
import { SecretStore } from '../../src/main/services/secretStore';
import { ConversationStore } from '../../src/main/services/conversationStore';
import { ChatService } from '../../src/main/llm/chatService';
import { configSchema } from '../../src/shared/config';
import type { ChatEvent } from '../../src/shared/llm';
import type { LLMProvider } from '../../src/main/llm/types';
const directories: string[] = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), 'littlellm-storage-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function cipher() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12),
        aes = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, aes.update(value, 'utf8'), aes.final(), aes.getAuthTag()]);
    },
    decryptString(bytes: Buffer) {
      const aes = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      aes.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([aes.update(bytes.subarray(12, -16)), aes.final()]).toString('utf8');
    },
  };
}
describe('main-only key storage', () => {
  it('persists ciphertext, returns metadata only, isolates providers and survives restart', () => {
    const path = directory(),
      crypto = cipher(),
      store = new SecretStore(path, crypto),
      secret = 'fixture-private-key-9087';
    const status = store.set('llm.openai-compatible', secret);
    expect(status).toMatchObject({ has: true, last4: '9087' });
    expect(JSON.stringify(status)).not.toContain(secret);
    expect(readFileSync(join(path, 'secrets.json'), 'utf8')).not.toContain(secret);
    expect(store.status('llm.anthropic').has).toBe(false);
    expect(new SecretStore(path, crypto).get('llm.openai-compatible')).toBe(secret);
    expect(store.set('llm.openai-compatible', secret).revision).not.toBe(status.revision);
    expect(store.set('llm.anthropic', 'abcd').last4).toBe('');
    store.clear('llm.openai-compatible');
    expect(new SecretStore(path, crypto).get('llm.openai-compatible')).toBeUndefined();
    expect(store.get('llm.anthropic')).toBe('abcd');
  });
  it('refuses insecure writes and preserves damaged key storage', () => {
    const path = directory(),
      crypto = cipher();
    const unavailable = new SecretStore(path, { ...crypto, isEncryptionAvailable: () => false });
    expect(() => unavailable.set('llm.anthropic', 'private')).toThrow('encryption');
    expect(existsSync(join(path, 'secrets.json'))).toBe(false);
    writeFileSync(join(path, 'secrets.json'), '{damaged');
    const damaged = new SecretStore(path, crypto);
    expect(() => damaged.get('llm.anthropic')).toThrow('backup');
    expect(() => damaged.clear('llm.anthropic')).toThrow('backup');
    expect(readFileSync(join(path, 'secrets.json'), 'utf8')).toBe('{damaged');
  });
});
describe('optional conversation persistence', () => {
  it('round trips complete exchanges, backs up corrupt data and clears the disk file', () => {
    const path = directory(),
      store = new ConversationStore(path),
      exchanges = [{ user: 'Question', assistant: 'Answer' }];
    store.save(exchanges);
    expect(new ConversationStore(path).load()).toEqual(exchanges);
    writeFileSync(join(path, 'conversation.json'), '{broken');
    expect(store.load()).toEqual([]);
    expect(store.warning).toContain('backup');
    expect(readdirSync(path).some((name) => name.startsWith('conversation.json.backup.'))).toBe(
      true,
    );
    store.clear();
    expect(existsSync(join(path, 'conversation.json'))).toBe(false);
  });
  it('session and never modes do not load or write saved history; explicit opt-in saves and restores', async () => {
    const path = directory(),
      cfg = configSchema.parse({}),
      store = new ConversationStore(path),
      events: ChatEvent[] = [];
    store.save([{ user: 'old', assistant: 'old reply' }]);
    const requests: unknown[] = [],
      provider: LLMProvider = {
        id: 'fixture',
        supportsImages: false,
        async *chat(messages) {
          requests.push(messages);
          yield { type: 'text', text: 'answer' };
          yield { type: 'done' };
        },
      };
    const service = new ChatService(
      () => cfg,
      (event) => events.push(event),
      undefined,
      () => provider,
      store,
    );
    const first = service.start('session question');
    await vi.waitFor(() =>
      expect(events.some((e) => e.requestId === first && e.delta.type === 'done')).toBe(true),
    );
    expect(requests[0]).toEqual([{ role: 'user', content: 'session question' }]);
    expect(store.load()).toEqual([{ user: 'old', assistant: 'old reply' }]);
    cfg.llm.persistence = 'permanent';
    service.persistenceChanged();
    expect(store.load()).toEqual([{ user: 'session question', assistant: 'answer' }]);
    const restored = new ChatService(
      () => cfg,
      (event) => events.push(event),
      undefined,
      () => provider,
      store,
    );
    const next = restored.start('next');
    await vi.waitFor(() =>
      expect(events.some((e) => e.requestId === next && e.delta.type === 'done')).toBe(true),
    );
    expect(requests[1]).toEqual([
      { role: 'user', content: 'session question' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'next' },
    ]);
    restored.clear();
    expect(existsSync(join(path, 'conversation.json'))).toBe(false);
    cfg.llm.persistence = 'never';
    const last = restored.start('no disk');
    await vi.waitFor(() =>
      expect(events.some((e) => e.requestId === last && e.delta.type === 'done')).toBe(true),
    );
    expect(existsSync(join(path, 'conversation.json'))).toBe(false);
  });
  it('reports a failed disk write instead of presenting history as saved', () => {
    const path = directory(),
      store = new ConversationStore(join(path, 'missing'));
    store.save([{ user: 'question', assistant: 'answer' }]);
    expect(store.warning).toContain('could not be saved');
  });
});
