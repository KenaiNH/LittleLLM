import type { Config, ConfigSection } from './config';
import type { AppError } from './errors';
import type { SpriteAssets, SpriteMasks } from './sprites';
import type { ChatUi } from './chatUi';
import type { PetViewport } from './petLayout';
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
export interface CompanionAPI {
  getConfig(): Promise<Result<Config>>;
  setConfig(section: ConfigSection, value: unknown): Promise<Result<Config>>;
  resetConfig(section: ConfigSection): Promise<Result<Config>>;
  onConfig(callback: (value: Config) => void): () => void;
  getSpriteAssets(): Promise<Result<SpriteAssets>>;
  getSpriteMasks(): Promise<Result<SpriteMasks>>;
  getChatUi(): Promise<Result<ChatUi>>;
  getPetViewport(): Promise<Result<PetViewport>>;
  layoutPet(
    sprite: { width: number; height: number },
    bubble: { width: number; height: number } | null,
  ): Promise<Result<PetViewport>>;
  onPetViewport(callback: (value: PetViewport) => void): () => void;
  openExternal(url: string): Promise<Result<null>>;
  copyText(text: string): Promise<Result<null>>;
  forwardWheel(value: {
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
    mode: 0 | 1 | 2;
    ctrl: boolean;
    shift: boolean;
  }): Promise<Result<null>>;
  dismissBubble(): Promise<Result<null>>;
  hoverBubble(hovering: boolean): void;
  onChatUi(callback: (value: ChatUi) => void): () => void;
  toggleInput(): Promise<Result<null>>;
  closeInput(): Promise<Result<null>>;
  saveDraft(text: string): void;
  submitInput(text: string): Promise<Result<null>>;
  setIgnoreMouse(ignore: boolean): void;
  movePet(x: number, y: number): void;
  resizePet(
    width: number,
    height: number,
    anchor?: { x: number; y: number; width: number; height: number },
  ): void;
  onVisibility(callback: (visible: boolean) => void): () => void;
  onDpi(callback: (scaleFactor: number) => void): () => void;
  openSettings(
    panel?:
      | 'General'
      | 'Sprites'
      | 'Model'
      | 'Persona'
      | 'Voice'
      | 'Voice Input'
      | 'Appearance'
      | 'Advanced',
  ): Promise<Result<null>>;
}
declare global {
  interface Window {
    companion: CompanionAPI;
  }
}
