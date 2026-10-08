import { expect, it } from 'vitest';
import { SETTINGS, matchesSearch } from '../../src/renderer/settings/definitions';
import { configSchema, configSections } from '../../src/shared/config';
import { applyTTSFields } from '../../src/shared/ttsCustom';
it('settings options round-trip through authoritative schemas and preserve configured bounds', () => {
  const config = configSchema.parse({});
  config.tts.custom.url = 'http://localhost:9000/speak';
  for (const row of SETTINGS) {
    let current: unknown = config[row.section];
    for (const key of row.key.split('.')) {
      expect(current && typeof current === 'object' && Object.hasOwn(current, key), row.label).toBe(
        true,
      );
      current = (current as Record<string, unknown>)[key];
    }
    const patched = (value: unknown) =>
      row.section === 'tts'
        ? applyTTSFields(config.tts, { [row.key]: value })
        : { ...config[row.section], [row.key]: value };
    for (const [option] of row.options ?? []) {
      if (row.key === 'window.displayTarget') continue;
      const value = typeof current === 'number' ? Number(option) : option;
      expect(
        configSections[row.section].safeParse(patched(value)).success,
        `${row.label}: ${option}`,
      ).toBe(true);
    }
    for (const number of [row.min, row.max]) {
      if (number === undefined) continue;
      expect(
        configSections[row.section].safeParse(patched(number * (row.multiplier ?? 1))).success,
        `${row.label}: ${number}`,
      ).toBe(true);
    }
  }
});
it('fuzzy search finds labels and synonyms and requires every query word', () => {
  expect(matchesSearch('Bubble scale zoom resize size', 'bbl scl')).toBe(true);
  expect(matchesSearch('Display monitor screen', 'monitor')).toBe(true);
  expect(matchesSearch('Base URL endpoint server', 'endpoint unknown')).toBe(false);
});
