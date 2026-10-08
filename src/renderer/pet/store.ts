import { create } from 'zustand';
import type { Config } from '../../shared/config';
import type { SpriteAssets } from '../../shared/sprites';
import type { SpriteState } from '../../shared/enums';
type PetStore = {
  config: Config | null;
  assets: SpriteAssets | null;
  state: SpriteState;
  error: string | null;
  setState: (state: SpriteState) => void;
  initialize: () => Promise<void>;
};
let generation = 0;
export const usePetStore = create<PetStore>((set, get) => ({
  config: null,
  assets: null,
  state: 'idle',
  error: null,
  setState: (state) => set({ state }),
  initialize: async () => {
    const epoch = ++generation;
    const cfg = await window.companion.getConfig();
    if (epoch !== generation) return;
    if (!cfg.ok) {
      set({ error: cfg.error.userMessage });
      return;
    }
    if (JSON.stringify(get().config?.sprite) === JSON.stringify(cfg.value.sprite)) {
      set({ config: cfg.value });
      return;
    }
    const assets = await window.companion.getSpriteAssets();
    if (epoch !== generation) return;
    if (!assets.ok) {
      set({ error: assets.error.userMessage });
      return;
    }
    set({
      config: cfg.value,
      assets:
        JSON.stringify(get().assets) === JSON.stringify(assets.value) ? get().assets : assets.value,
      error: null,
    });
  },
}));
