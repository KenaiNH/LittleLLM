import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Exchange } from '../llm/history';
import { chatImageSchema } from '../../shared/attachments';
const schema = z
  .object({
    version: z.literal(1),
    exchanges: z
      .array(
        z
          .object({
            user: z.string().max(32000).optional(),
            assistant: z.string().max(512000),
            images: z.array(chatImageSchema).max(10).optional(),
          })
          .strict(),
      )
      .max(4096),
  })
  .strict();
const LIMIT = 32 * 1024 * 1024;
export class ConversationStore {
  private file: string;
  warning: string | null = null;
  constructor(directory: string) {
    this.file = join(directory, 'conversation.json');
  }
  load(): Exchange[] {
    if (!existsSync(this.file)) return [];
    try {
      if (statSync(this.file).size > LIMIT) throw new Error('History exceeds limit');
      return schema.parse(JSON.parse(readFileSync(this.file, 'utf8'))).exchanges;
    } catch {
      try {
        copyFileSync(this.file, this.file + '.backup.' + randomUUID());
        this.warning = 'Saved history could not be loaded. A backup was kept.';
      } catch {
        this.warning =
          'Saved history could not be loaded or backed up. The original file was kept.';
      }
      return [];
    }
  }
  save(exchanges: Exchange[]) {
    try {
      const body = JSON.stringify(schema.parse({ version: 1, exchanges }));
      if (Buffer.byteLength(body) > LIMIT) throw new Error('History exceeds limit');
      writeFileSync(this.file + '.tmp', body, { mode: 0o600 });
      renameSync(this.file + '.tmp', this.file);
      this.warning = null;
    } catch {
      this.warning = 'Conversation history could not be saved.';
    }
  }
  clear() {
    if (existsSync(this.file)) unlinkSync(this.file);
    this.warning = null;
  }
}
