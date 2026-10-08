import { expect, it } from 'vitest';
import { SETTINGS, matchesSearch } from '../../src/renderer/settings/definitions';
import { configSchema, configSections } from '../../src/shared/config';
it('settings options round-trip through authoritative schemas and preserve configured bounds', () => {
  const config = configSchema.parse({});
  for (const row of SETTINGS) {
    expect(row.key in config[row.section], row.label).toBe(true);
    for (const [option] of row.options ?? []) {
      if (row.key === 'window.displayTarget') continue;
      const current = (config[row.section] as Record<string, unknown>)[row.key];
      const value = typeof current === 'number' ? Number(option) : option;
      expect(
        configSections[row.section].safeParse({ ...config[row.section], [row.key]: value }).success,
        `${row.label}: ${option}`,
      ).toBe(true);
    }
    for (const number of [row.min, row.max]) {
      if (number === undefined) continue;
      expect(
        configSections[row.section].safeParse({
          ...config[row.section],
          [row.key]: number * (row.multiplier ?? 1),
        }).success,
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
