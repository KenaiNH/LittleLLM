import { expect, it } from 'vitest';
import { httpUrlSchema } from '../../src/shared/config';
it('invalid and credential-bearing endpoints fail validation without throwing from safeParse', () => {
  for (const value of [
    'invalid endpoint',
    '',
    'ftp://localhost',
    'http://user:secret@localhost/v1',
  ])
    expect(httpUrlSchema.safeParse(value).success).toBe(false);
  expect(httpUrlSchema.safeParse('http://localhost:11434/v1').success).toBe(true);
});
