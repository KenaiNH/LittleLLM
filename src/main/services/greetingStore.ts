import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
const schema = z.object({ day: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/) }).strict();
export class GreetingStore {
  private value: string | null = null;
  private file: string;
  constructor(directory: string) {
    this.file = join(directory, 'greeting-state.json');
    try {
      this.value = schema.parse(JSON.parse(readFileSync(this.file, 'utf8'))).day;
    } catch {
      /* Missing or invalid state starts fresh. */
    }
  }
  get() {
    return this.value;
  }
  set(day: string) {
    this.value = schema.parse({ day }).day;
    try {
      writeFileSync(this.file + '.tmp', JSON.stringify({ day }), { mode: 0o600 });
      renameSync(this.file + '.tmp', this.file);
    } catch {
      console.warn('Greeting frequency could not be saved.');
    }
  }
}
