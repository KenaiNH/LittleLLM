import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { configSchema } from '../shared/config';
import { CHANNELS } from '../main/ipc/channels';
import {
  emptySchema,
  configSetSchema,
  configPatchSchema,
  configResetSchema,
  configResultSchema,
  settingsRequestSchema,
  voidResultSchema,
  resultSchema,
  resizeSchema,
  visibilitySchema,
  dpiSchema,
  booleanSchema,
  moveSchema,
} from '../main/ipc/schemas';
import { spriteAssetsSchema, spriteMasksSchema } from '../shared/sprites';
import type { CompanionAPI } from '../shared/api';
import { chatUiSchema, draftSchema, submitSchema, copyTextSchema } from '../shared/chatUi';
import { petViewportSchema, petLayoutRequestSchema } from '../shared/petLayout';
import { externalUrlSchema } from '../main/ipc/schemas';
import { wheelSchema } from '../main/ipc/schemas';
import {
  abortChatSchema,
  requestIdSchema,
  chatEventSchema,
  modelInfoSchema,
  connectionTestSchema,
} from '../shared/llm';
import {
  secretRequestSchema,
  secretSetSchema,
  secretStatusSchema,
  settingsEnvironmentSchema,
  settingsPanelSchema,
  resetPanelSchema,
  resetPanelResultSchema,
} from '../shared/settings';
import { z } from 'zod';
import { ttsPacketSchema, ttsFeedbackSchema, ttsTestSchema, voiceListSchema } from '../shared/tts';
import {
  attachmentFileSchema,
  attachmentRemoveSchema,
  attachmentsSchema,
  capabilitySchema,
} from '../shared/attachments';
import { companionStateSchema, overrideStateSchema } from '../shared/state';
import {
  spriteImportRequestSchema,
  spriteResetRequestSchema,
  spritePatchSchema,
} from '../shared/spriteImport';
const api: CompanionAPI = {
  listVoices: async () =>
    resultSchema(voiceListSchema).parse(
      await ipcRenderer.invoke(CHANNELS.ttsVoices, emptySchema.parse({})),
    ),
  testVoice: async () =>
    resultSchema(ttsTestSchema).parse(
      await ipcRenderer.invoke(CHANNELS.ttsTest, emptySchema.parse({})),
    ),
  onTTSAudio: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = ttsPacketSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.ttsAudio, listener);
    return () => ipcRenderer.removeListener(CHANNELS.ttsAudio, listener);
  },
  speechFeedback: (event) => ipcRenderer.send(CHANNELS.ttsFeedback, ttsFeedbackSchema.parse(event)),
  getAttachmentCapability: async () =>
    resultSchema(capabilitySchema).parse(await ipcRenderer.invoke(CHANNELS.attachCapability, {})),
  attachClipboardImage: async () =>
    resultSchema(attachmentsSchema).parse(await ipcRenderer.invoke(CHANNELS.attachClipboard, {})),
  browseAttachments: async () =>
    resultSchema(attachmentsSchema).parse(
      await ipcRenderer.invoke(CHANNELS.attachFile, attachmentFileSchema.parse({})),
    ),
  attachDroppedFiles: async (files) =>
    resultSchema(attachmentsSchema).parse(
      await ipcRenderer.invoke(
        CHANNELS.attachFile,
        attachmentFileSchema.parse({ paths: files.map((file) => webUtils.getPathForFile(file)) }),
      ),
    ),
  removeAttachment: async (id) =>
    resultSchema(attachmentsSchema).parse(
      await ipcRenderer.invoke(CHANNELS.attachRemove, attachmentRemoveSchema.parse({ id })),
    ),
  browseSprite: async (state, mode) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(
        CHANNELS.spriteImport,
        spriteImportRequestSchema.parse({ state, mode }),
      ),
    ),
  importDroppedSprite: async (state, mode, files) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(
        CHANNELS.spriteImport,
        spriteImportRequestSchema.parse({
          state,
          mode,
          paths: files.map((file) => webUtils.getPathForFile(file)),
        }),
      ),
    ),
  patchSpriteState: async (state, value) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.spritePatch, spritePatchSchema.parse({ state, value })),
    ),
  resetSprite: async (state) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.spriteReset, spriteResetRequestSchema.parse({ state })),
    ),
  importSpritePack: async () =>
    configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.packImport, emptySchema.parse({}))),
  exportSpritePack: async () =>
    resultSchema(z.boolean()).parse(
      await ipcRenderer.invoke(CHANNELS.packExport, emptySchema.parse({})),
    ),
  openSpritesFolder: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.shellOpenPath, { kind: 'sprites' })),
  patchConfig: async (section, value) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.configPatch, configPatchSchema.parse({ section, value })),
    ),
  getSettingsEnvironment: async () =>
    resultSchema(settingsEnvironmentSchema).parse(
      await ipcRenderer.invoke(CHANNELS.settingsEnvironment, emptySchema.parse({})),
    ),
  onSettingsEnvironment: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = settingsEnvironmentSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.settingsEnvironmentChanged, listener);
    return () => ipcRenderer.removeListener(CHANNELS.settingsEnvironmentChanged, listener);
  },
  onSettingsPanel: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = settingsPanelSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.settingsPanel, listener);
    return () => ipcRenderer.removeListener(CHANNELS.settingsPanel, listener);
  },
  resetSettingsPanel: async (panel) =>
    resultSchema(resetPanelResultSchema).parse(
      await ipcRenderer.invoke(CHANNELS.settingsResetPanel, resetPanelSchema.parse({ panel })),
    ),
  restartApp: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.appRestart, emptySchema.parse({}))),
  confirmClearHistory: async () =>
    resultSchema(z.boolean()).parse(
      await ipcRenderer.invoke(CHANNELS.historyConfirmClear, emptySchema.parse({})),
    ),
  getSecretStatus: async (id) =>
    resultSchema(secretStatusSchema).parse(
      await ipcRenderer.invoke(CHANNELS.secretHas, secretRequestSchema.parse({ id })),
    ),
  setSecret: async (id, value) =>
    resultSchema(secretStatusSchema).parse(
      await ipcRenderer.invoke(CHANNELS.secretSet, secretSetSchema.parse({ id, value })),
    ),
  clearSecret: async (id) =>
    resultSchema(secretStatusSchema).parse(
      await ipcRenderer.invoke(CHANNELS.secretClear, secretRequestSchema.parse({ id })),
    ),
  listModels: async () =>
    resultSchema(z.array(modelInfoSchema).max(10000)).parse(
      await ipcRenderer.invoke(CHANNELS.llmModels, emptySchema.parse({})),
    ),
  testModelConnection: async () =>
    resultSchema(connectionTestSchema).parse(
      await ipcRenderer.invoke(CHANNELS.llmTest, emptySchema.parse({})),
    ),
  getState: async () =>
    resultSchema(companionStateSchema).parse(
      await ipcRenderer.invoke(CHANNELS.stateGet, emptySchema.parse({})),
    ),
  overrideState: async (state) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.stateOverride, overrideStateSchema.parse({ state })),
    ),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = companionStateSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.stateChanged, listener);
    return () => ipcRenderer.removeListener(CHANNELS.stateChanged, listener);
  },
  chat: async (text) =>
    resultSchema(requestIdSchema).parse(
      await ipcRenderer.invoke(CHANNELS.llmChat, submitSchema.parse({ text })),
    ),
  abortChat: async (requestId) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.llmAbort, abortChatSchema.parse({ requestId })),
    ),
  regenerateChat: async () =>
    resultSchema(requestIdSchema).parse(
      await ipcRenderer.invoke(CHANNELS.llmRegenerate, emptySchema.parse({})),
    ),
  clearConversation: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.llmClear, emptySchema.parse({}))),
  onChatDelta: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = chatEventSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.llmDelta, listener);
    return () => ipcRenderer.removeListener(CHANNELS.llmDelta, listener);
  },
  getConfig: async () =>
    configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configGet, emptySchema.parse({}))),
  getChatUi: async () =>
    resultSchema(chatUiSchema).parse(
      await ipcRenderer.invoke(CHANNELS.chatUiGet, emptySchema.parse({})),
    ),
  getPetViewport: async () =>
    resultSchema(petViewportSchema).parse(
      await ipcRenderer.invoke(CHANNELS.windowViewport, emptySchema.parse({})),
    ),
  layoutPet: async (sprite, bubble, anchor) =>
    resultSchema(petViewportSchema).parse(
      await ipcRenderer.invoke(
        CHANNELS.windowLayout,
        petLayoutRequestSchema.parse({ sprite, bubble, anchor }),
      ),
    ),
  onPetViewport: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = petViewportSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.windowViewportChanged, listener);
    return () => ipcRenderer.removeListener(CHANNELS.windowViewportChanged, listener);
  },
  openExternal: async (url) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.shellOpenExternal, externalUrlSchema.parse({ url })),
    ),
  copyText: async (text) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.clipboardCopy, copyTextSchema.parse({ text })),
    ),
  forwardWheel: async (value) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.windowForwardWheel, wheelSchema.parse(value)),
    ),
  dismissBubble: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.bubbleDismiss, emptySchema.parse({}))),
  hoverBubble: (hovering) => ipcRenderer.send(CHANNELS.bubbleHover, booleanSchema.parse(hovering)),
  onChatUi: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = chatUiSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.chatUiChanged, listener);
    return () => ipcRenderer.removeListener(CHANNELS.chatUiChanged, listener);
  },
  toggleInput: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.inputToggle, emptySchema.parse({}))),
  closeInput: async () =>
    voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.inputClose, emptySchema.parse({}))),
  saveDraft: (text) => ipcRenderer.send(CHANNELS.inputDraft, draftSchema.parse({ text })),
  submitInput: async (text) =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.inputSubmit, submitSchema.parse({ text })),
    ),
  getSpriteAssets: async () =>
    resultSchema(spriteAssetsSchema).parse(
      await ipcRenderer.invoke(CHANNELS.spriteAssets, emptySchema.parse({})),
    ),
  getSpriteMasks: async () =>
    resultSchema(spriteMasksSchema).parse(
      await ipcRenderer.invoke(CHANNELS.spriteMask, emptySchema.parse({})),
    ),
  setIgnoreMouse: (ignore) =>
    ipcRenderer.send(CHANNELS.windowIgnoreMouse, booleanSchema.parse(ignore)),
  movePet: (x, y) => ipcRenderer.send(CHANNELS.windowMove, moveSchema.parse({ x, y })),
  resizePet: (width, height, anchor) =>
    ipcRenderer.send(CHANNELS.windowResize, resizeSchema.parse({ width, height, anchor })),
  onVisibility: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = visibilitySchema.safeParse(value);
      if (parsed.success) callback(parsed.data.visible);
    };
    ipcRenderer.on(CHANNELS.windowVisibility, listener);
    return () => ipcRenderer.removeListener(CHANNELS.windowVisibility, listener);
  },
  onDpi: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = dpiSchema.safeParse(value);
      if (parsed.success) callback(parsed.data.scaleFactor);
    };
    ipcRenderer.on(CHANNELS.windowDpi, listener);
    return () => ipcRenderer.removeListener(CHANNELS.windowDpi, listener);
  },
  setConfig: async (section, value) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.configSet, configSetSchema.parse({ section, value })),
    ),
  resetConfig: async (section) =>
    configResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.configReset, configResetSchema.parse({ section })),
    ),
  onConfig: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = configSchema.safeParse(value);
      if (parsed.success) callback(parsed.data);
    };
    ipcRenderer.on(CHANNELS.configChanged, listener);
    return () => ipcRenderer.removeListener(CHANNELS.configChanged, listener);
  },
  openSettings: async (panel = 'General') =>
    voidResultSchema.parse(
      await ipcRenderer.invoke(CHANNELS.windowSettings, settingsRequestSchema.parse({ panel })),
    ),
};
contextBridge.exposeInMainWorld('companion', api);
