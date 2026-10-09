import type { Config, ConfigSection } from './config';
import type { PersonaAction, PersonaPreview } from './persona';
import type { AppError } from './errors';
import type { SpriteAssets, SpriteMasks } from './sprites';
import type { ChatUi } from './chatUi';
import type { PetViewport } from './petLayout';
import type { ChatEvent } from './llm';
import type { CompanionState } from './state';
import type { SpriteState } from './enums';
import type { SecretId, SecretStatus, SettingsEnvironment } from './settings';
import type { ModelInfo, ConnectionTest } from './llm';
import type { SpriteTarget } from './spriteImport';
import type { SpriteStateConfig } from './config';
import type { Attachment, ImageCapability } from './attachments';
import type { TTSPacket, TTSFeedback } from './tts';
import type { z } from 'zod';
import type { ttsTestSchema } from './tts';
import type { SttFrame, SttCapture, SttFeedback } from './stt';
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
import type { DiagnosticAction, RuntimeStatus, SessionPatch } from './diagnostics';
export interface CompanionAPI {
  diagnostics(action: DiagnosticAction): Promise<Result<Config>>;
  getRuntime(): Promise<Result<RuntimeStatus>>;
  setSession(changes: SessionPatch): Promise<Result<RuntimeStatus>>;
  onRuntime(callback: (status: RuntimeStatus) => void): () => void;
  personaAction(action: PersonaAction): Promise<Result<Config>>;
  previewPersona(): Promise<Result<PersonaPreview>>;
  testPersona(): Promise<Result<string>>;
  importPersona(): Promise<Result<Config>>;
  exportPersona(id: string): Promise<Result<boolean>>;
  startStt(action?: 'toggle' | 'start' | 'test-microphone'): Promise<Result<null>>;
  stopStt(): Promise<Result<null>>;
  abortStt(): Promise<Result<null>>;
  previewMicrophone(active: boolean): Promise<Result<null>>;
  testSttConnection(): Promise<Result<{ elapsedMs: number; text: string }>>;
  getInputDevices(): Promise<Result<{ id: string; label: string }[]>>;
  reinsertTranscript(): Promise<Result<null>>;
  openMicrophoneSettings(): Promise<Result<null>>;
  saveCaret(start: number, end: number): void;
  sendSttFrame(frame: SttFrame): void;
  sttFeedback(event: SttFeedback): void;
  onSttCapture(callback: (event: SttCapture) => void): () => void;
  listVoices(): Promise<Result<{ id: string; name: string }[]>>;
  testVoice(): Promise<Result<z.infer<typeof ttsTestSchema>>>;
  onTTSAudio(callback: (event: TTSPacket) => void): () => void;
  speechFeedback(event: TTSFeedback): void;
  getAttachmentCapability(): Promise<Result<ImageCapability>>;
  attachClipboardImage(): Promise<Result<Attachment[]>>;
  browseAttachments(): Promise<Result<Attachment[]>>;
  attachDroppedFiles(files: File[]): Promise<Result<Attachment[]>>;
  removeAttachment(id: string): Promise<Result<Attachment[]>>;
  browseSprite(state: SpriteTarget, mode: SpriteStateConfig['mode']): Promise<Result<Config>>;
  importDroppedSprite(
    state: SpriteTarget,
    mode: SpriteStateConfig['mode'],
    files: File[],
  ): Promise<Result<Config>>;
  patchSpriteState(state: SpriteTarget, value: Record<string, unknown>): Promise<Result<Config>>;
  resetSprite(state: SpriteTarget): Promise<Result<Config>>;
  importSpritePack(): Promise<Result<Config>>;
  exportSpritePack(): Promise<Result<boolean>>;
  openSpritesFolder(): Promise<Result<null>>;
  getSettingsEnvironment(): Promise<Result<SettingsEnvironment>>;
  onSettingsEnvironment(callback: (value: SettingsEnvironment) => void): () => void;
  onSettingsPanel(
    callback: (panel: NonNullable<Parameters<CompanionAPI['openSettings']>[0]>) => void,
  ): () => void;
  resetSettingsPanel(
    panel: NonNullable<Parameters<CompanionAPI['openSettings']>[0]>,
  ): Promise<Result<{ config: Config; reset: boolean }>>;
  restartApp(): Promise<Result<null>>;
  confirmClearHistory(): Promise<Result<boolean>>;
  getSecretStatus(id: SecretId): Promise<Result<SecretStatus>>;
  setSecret(id: SecretId, value: string): Promise<Result<SecretStatus>>;
  clearSecret(id: SecretId): Promise<Result<SecretStatus>>;
  listModels(): Promise<Result<ModelInfo[]>>;
  testModelConnection(): Promise<Result<ConnectionTest>>;
  getState(): Promise<Result<CompanionState>>;
  onState(callback: (value: CompanionState) => void): () => void;
  overrideState(state: SpriteState | 'auto'): Promise<Result<null>>;
  getConfig(): Promise<Result<Config>>;
  setConfig(section: ConfigSection, value: unknown): Promise<Result<Config>>;
  patchConfig(section: ConfigSection, value: Record<string, unknown>): Promise<Result<Config>>;
  resetConfig(section: ConfigSection): Promise<Result<Config>>;
  onConfig(callback: (value: Config) => void): () => void;
  getSpriteAssets(): Promise<Result<SpriteAssets>>;
  getSpriteMasks(): Promise<Result<SpriteMasks>>;
  getChatUi(): Promise<Result<ChatUi>>;
  getPetViewport(): Promise<Result<PetViewport>>;
  layoutPet(
    sprite: { width: number; height: number },
    bubble: { width: number; height: number } | null,
    anchor?: { x: number; y: number },
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
  chat(text: string): Promise<Result<string>>;
  abortChat(requestId?: string): Promise<Result<null>>;
  regenerateChat(): Promise<Result<string>>;
  clearConversation(): Promise<Result<null>>;
  onChatDelta(callback: (event: ChatEvent) => void): () => void;
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
