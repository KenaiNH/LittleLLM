import { safeStorage } from 'electron';
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { secretIdSchema, type SecretId, type SecretStatus } from '../../shared/settings';
import { ProviderError } from '../llm/errors';
const recordSchema = z
  .object({
    encrypted: z.string().min(1).max(65536),
    last4: z.string().max(4),
    revision: z.string().uuid(),
  })
  .strict();
const fileSchema = z
  .object({ version: z.literal(1), keys: z.record(secretIdSchema, recordSchema) })
  .strict();
type Cipher = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>;
export class SecretStore {
  private file: string;
  private data: z.infer<typeof fileSchema> = { version: 1, keys: {} };
  private blocked = false;
  constructor(
    directory: string,
    private cipher: Cipher = safeStorage,
  ) {
    this.file = join(directory, 'secrets.json');
    if (existsSync(this.file)) {
      try {
        const bytes = readFileSync(this.file);
        if (bytes.length > 1024 * 1024) throw new Error('Key storage exceeds size limit');
        this.data = fileSchema.parse(JSON.parse(bytes.toString('utf8')));
      } catch {
        this.blocked = true;
      }
    }
  }
  private available() {
    if (this.blocked)
      throw new ProviderError({
        code: 'AUTH_MISSING',
        retryable: false,
        userMessage:
          'Saved API keys could not be loaded. Restore secrets.json from a backup before changing keys.',
      });
    if (!this.cipher.isEncryptionAvailable())
      throw new ProviderError({
        code: 'AUTH_MISSING',
        retryable: false,
        userMessage: 'Windows encryption is unavailable. API keys cannot be saved securely.',
      });
  }
  status(id: SecretId): SecretStatus {
    if (this.blocked) this.available();
    const record = this.data.keys[id];
    return { has: Boolean(record), last4: record?.last4 ?? '', revision: record?.revision ?? '' };
  }
  // Only provider requests call get. No IPC exposes decrypted values.
  get(id: SecretId): string | undefined {
    const record = this.data.keys[id];
    if (!record && !this.blocked) return undefined;
    this.available();
    return record ? this.cipher.decryptString(Buffer.from(record.encrypted, 'base64')) : undefined;
  }
  set(id: SecretId, value: string): SecretStatus {
    this.available();
    const record = recordSchema.parse({
      encrypted: this.cipher.encryptString(value).toString('base64'),
      last4: value.length > 4 ? value.slice(-4) : '',
      revision: randomUUID(),
    });
    this.write({ ...this.data.keys, [id]: record });
    return this.status(id);
  }
  clear(id: SecretId): SecretStatus {
    if (this.blocked) this.available();
    const keys = Object.fromEntries(Object.entries(this.data.keys).filter(([key]) => key !== id));
    this.write(keys);
    return this.status(id);
  }
  private write(keys: z.infer<typeof fileSchema>['keys']) {
    const next = fileSchema.parse({ version: 1, keys });
    const temporary = this.file + '.tmp';
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, this.file);
    this.data = next;
  }
}
