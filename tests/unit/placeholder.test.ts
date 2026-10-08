import { it, expect } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
it('ships distinct transparent placeholders for all three required states', async () => {
  const images = await Promise.all(
    ['idle', 'thinking', 'speaking'].map(async (state) => {
      const bytes = await readFile(`assets/default-sprites/${state}.png`);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(128);
      expect(data[3]).toBe(0);
      expect([...data].some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
      return bytes.toString('base64');
    }),
  );
  expect(new Set(images).size).toBe(3);
});
