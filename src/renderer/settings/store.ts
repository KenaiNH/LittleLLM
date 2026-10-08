import { create } from 'zustand';
import { configSections, type Config, type ConfigSection } from '../../shared/config';
import type { SettingsEnvironment } from '../../shared/settings';
type SettingsStore = {
  config: Config | null;
  environment: SettingsEnvironment | null;
  error: string | null;
  invalid: Record<string, string>;
  drafts: Record<string, string>;
  initialize: () => Promise<void>;
  receive: (config: Config) => void;
  patch: (section: ConfigSection, changes: Record<string, unknown>) => Promise<string | null>;
  markInvalid: (key: string, message: string | null) => void;
  draft: (key: string, value: string | null) => void;
};
let latest: Config | null = null,
  queue = Promise.resolve();
export const flushSettings = () => queue;
export const useSettingsStore = create<SettingsStore>((set, get) => ({
  config: null,
  environment: null,
  error: null,
  invalid: {},
  drafts: {},
  receive: (config) => {
    latest = config;
    set({ config });
  },
  initialize: async () => {
    const [config, environment] = await Promise.all([
      window.companion.getConfig(),
      window.companion.getSettingsEnvironment(),
    ]);
    if (config.ok) get().receive(config.value);
    else set({ error: config.error.userMessage });
    if (environment.ok) set({ environment: environment.value });
    else set({ error: environment.error.userMessage });
  },
  markInvalid: (key, message) =>
    set((state) => {
      const invalid = message
        ? { ...state.invalid, [key]: message }
        : Object.fromEntries(Object.entries(state.invalid).filter(([name]) => name !== key));
      return { invalid };
    }),
  draft: (key, value) =>
    set((state) => {
      const drafts =
        value === null
          ? Object.fromEntries(Object.entries(state.drafts).filter(([name]) => name !== key))
          : { ...state.drafts, [key]: value };
      return { drafts };
    }),
  patch: async (section, changes) => {
    const config = latest;
    if (!config) return 'Settings have not loaded yet.';
    const valid = configSections[section].safeParse({ ...config[section], ...changes });
    if (!valid.success) return valid.error.issues[0]?.message ?? 'Enter a valid value.';
    let message: string | null = null;
    queue = queue.then(async () => {
      const current = latest;
      if (!current) return;
      try {
        const result = await window.companion.patchConfig(section, changes);
        if (result.ok) get().receive(result.value);
        else message = result.error.userMessage;
      } catch {
        message = 'The change could not be saved.';
      }
    });
    await queue;
    return message;
  },
}));
