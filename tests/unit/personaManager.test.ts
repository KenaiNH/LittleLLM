import { it, expect, vi, beforeEach } from 'vitest';
const dialog = vi.hoisted(() => ({ showMessageBox: vi.fn() }));
vi.mock('electron', () => ({ dialog }));
vi.mock('../../src/main/windows/settingsWindow', () => ({ getSettingsWindow: () => ({}) }));
import { PersonaManager } from '../../src/main/services/personaManager';
import { configSchema, personaCardSchema, type Config } from '../../src/shared/config';
import type { ConfigStore } from '../../src/main/services/configStore';
const id = '00000000-0000-4000-8000-000000000001',
  second = '00000000-0000-4000-8000-000000000002';
const card = personaCardSchema.parse({ id, name: 'Mira', voiceOverride: 'imported-voice' });
function fixture() {
  let cfg = configSchema.parse({
    persona: {
      enabled: true,
      activeId: id,
      library: [card, { ...card, id: second, name: 'Other' }],
    },
  });
  const store = {
    get: () => structuredClone(cfg),
    set: (section: keyof Config, value: unknown) => {
      cfg = configSchema.parse({ ...cfg, [section]: value });
      return store.get();
    },
    setSections: (sections: Partial<Config>) => {
      cfg = configSchema.parse({ ...cfg, ...sections });
      return store.get();
    },
  };
  const manager = new PersonaManager(store as unknown as ConfigStore),
    clear = vi.fn();
  manager.bind({
    hasConversation: () => true,
    clearConversation: clear,
    context: () => ({ date: '', time: '', weekday: '', state: 'idle' }),
  });
  return { manager, store, clear };
}
beforeEach(() => dialog.showMessageBox.mockReset());
it('default switch clears actual history and swaps the conflicting preset; keep retains it', async () => {
  const { manager, store, clear } = fixture();
  await manager.action({ type: 'select', id: second });
  expect(clear).toHaveBeenCalledTimes(1);
  expect(store.get().llm.promptPreset).toBe('persona-driven');
  expect(store.get().llm.systemPrompt).not.toContain('Do not describe');
  await manager.patch({ onSwitch: 'keep' });
  await manager.action({ type: 'select', id });
  expect(clear).toHaveBeenCalledTimes(1);
});
it('preserves Custom prompts until explicitly fixed, deletes active without dangling references', async () => {
  const { manager, store } = fixture();
  store.set('llm', {
    ...store.get().llm,
    promptPreset: 'custom',
    systemPrompt: 'Custom. Do not describe your own appearance or actions.',
  });
  await manager.patch({ enabled: true });
  expect(store.get().llm.systemPrompt).toContain('Do not describe');
  await manager.action({ type: 'fix-prompt' });
  expect(store.get().llm.systemPrompt).toBe('Custom.');
  dialog.showMessageBox.mockResolvedValue({ response: 1 });
  await manager.action({ type: 'delete', id });
  expect(store.get().persona).toMatchObject({ activeId: null, enabled: false });
});
it.each(['ask', 'auto', 'ignore'] as const)(
  'implements pack %s without silently applying imported voice',
  async (policy) => {
    const { manager, store, clear } = fixture();
    await manager.patch({ packPersonaPolicy: policy });
    dialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
    await manager.importPack(store.get().sprite, card, 'pack-id');
    const persona = store.get().persona;
    if (policy === 'ignore') {
      expect(persona.library).toHaveLength(2);
      expect(clear).not.toHaveBeenCalled();
    } else {
      expect(persona.library).toHaveLength(3);
      expect(persona.library.at(-1)?.voiceOverride).toBeUndefined();
      expect(persona.activeId).not.toBe(id);
      expect(clear).toHaveBeenCalledTimes(1);
    }
  },
);
it('pack import-only keeps the active persona and history; checked voice is explicit', async () => {
  const { manager, store, clear } = fixture();
  dialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: true });
  await manager.importPack(store.get().sprite, card, 'pack-id');
  expect(store.get().persona.activeId).toBe(id);
  expect(clear).not.toHaveBeenCalled();
  expect(store.get().persona.library.at(-1)?.voiceOverride).toBe('imported-voice');
});
