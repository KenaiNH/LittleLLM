import { BrowserWindow, ipcMain, shell, clipboard, dialog, screen } from 'electron';
import { z } from 'zod';
import { CHANNELS } from './channels';
import {
  emptySchema,
  configSetSchema,
  configPatchSchema,
  configResetSchema,
  configResultSchema,
  settingsRequestSchema,
  voidResultSchema,
  resultSchema,
} from './schemas';
import type { ConfigStore } from '../services/configStore';
import { normalizeError } from '../../shared/errors';
import type { SpriteLoader } from '../services/spriteLoader';
import { spriteAssetsSchema, spriteMasksSchema } from '../../shared/sprites';
import { AlphaMaskCache } from '../services/alphaMask';
import { app } from 'electron';
import { externalUrlSchema } from './schemas';
import { copyTextSchema } from '../../shared/chatUi';
import type { SecretStore } from '../services/secretStore';
import {
  secretSetSchema,
  secretRequestSchema,
  secretStatusSchema,
  settingsEnvironmentSchema,
  resetPanelSchema,
  resetPanelResultSchema,
} from '../../shared/settings';
import { connectionTestSchema, modelInfoSchema } from '../../shared/llm';
import { createLLMProvider } from '../llm/registry';
import { ProviderError } from '../llm/errors';
import { SETTINGS_FONTS } from '../../shared/settings';
import { join } from 'node:path';
import { getSettingsWindow } from '../windows/settingsWindow';
import type { ConfigSection } from '../../shared/config';
import type { ConversationStore } from '../services/conversationStore';
import { SpriteManager } from '../services/spriteManager';
import {
  spriteImportRequestSchema,
  spriteResetRequestSchema,
  spritePatchSchema,
} from '../../shared/spriteImport';
import { boundedFile } from '../services/spriteFiles';
import { readSpritePack, writeSpritePack, PACK_FILE_LIMIT } from '../services/spritePacks';
import { writeFile } from 'node:fs/promises';
export function registerHandlers(
  config: ConfigStore,
  settings: (panel: string) => void,
  sprites: SpriteLoader,
  secrets: SecretStore,
  history: ConversationStore,
): void {
  const masks = new AlphaMaskCache(app.getPath('userData'), sprites);
  const spriteManager = new SpriteManager(config, sprites);
  const handle = <S extends z.ZodTypeAny, R extends z.ZodTypeAny>(
    channel: string,
    request: S,
    response: R,
    handler: (payload: z.output<S>) => z.input<R> | Promise<z.input<R>>,
    settingsOnly = false,
  ) => {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      try {
        if (
          !BrowserWindow.fromWebContents(event.sender) ||
          event.senderFrame !== event.sender.mainFrame
        )
          throw new Error('Untrusted IPC sender');
        if (settingsOnly && event.sender !== getSettingsWindow()?.webContents)
          throw new Error('This action requires Settings');
        return resultSchema(response).parse({
          ok: true,
          value: await handler(request.parse(payload)),
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof ProviderError ? error.normalized : normalizeError(error),
        };
      }
    });
  };
  const broadcast = () => {
    updateEnvironment();
    const value = config.get();
    for (const win of BrowserWindow.getAllWindows())
      win.webContents.send(CHANNELS.configChanged, value);
    return value;
  };
  const settingsOwner = () => {
    const window = getSettingsWindow();
    if (!window) throw new Error('Settings is closed');
    return window;
  };
  handle(
    CHANNELS.spriteImport,
    spriteImportRequestSchema,
    configResultSchema.options[0].shape.value,
    async (p) => {
      let paths = p.paths;
      if (!paths) {
        let folder = false;
        if (p.mode === 'frames') {
          const choice = await dialog.showMessageBox(settingsOwner(), {
            type: 'question',
            message: 'Choose image sequence',
            buttons: ['Cancel', 'Open folder', 'Select images'],
            cancelId: 0,
            defaultId: 1,
            noLink: true,
          });
          if (choice.response === 0) return config.get();
          folder = choice.response === 1;
        }
        const chosen = await dialog.showOpenDialog(settingsOwner(), {
          title: `Import ${p.state} sprite`,
          properties: folder
            ? ['openDirectory']
            : p.mode === 'frames'
              ? ['openFile', 'multiSelections']
              : ['openFile'],
          filters: folder
            ? []
            : [{ name: 'Sprite images', extensions: ['png', 'apng', 'gif', 'webp'] }],
        });
        if (chosen.canceled) return config.get();
        paths = chosen.filePaths;
      }
      await spriteManager.import(p.state, p.mode, paths);
      return broadcast();
    },
    true,
  );
  handle(
    CHANNELS.spritePatch,
    spritePatchSchema,
    configResultSchema.options[0].shape.value,
    async (p) => {
      await spriteManager.patchState(p.state, p.value);
      return broadcast();
    },
    true,
  );
  handle(
    CHANNELS.spriteReset,
    spriteResetRequestSchema,
    configResultSchema.options[0].shape.value,
    async (p) => {
      await spriteManager.reset(p.state);
      return broadcast();
    },
    true,
  );
  handle(
    CHANNELS.shellOpenPath,
    z.object({ kind: z.literal('sprites') }).strict(),
    z.null(),
    async () => {
      const error = await shell.openPath(sprites.root);
      if (error) throw new Error('The sprites folder could not be opened');
      return null;
    },
    true,
  );
  handle(
    CHANNELS.packImport,
    emptySchema,
    configResultSchema.options[0].shape.value,
    async () => {
      const chosen = await dialog.showOpenDialog(settingsOwner(), {
        title: 'Import Sprite Pack',
        properties: ['openFile'],
        filters: [{ name: 'Sprite Pack', extensions: ['zip'] }],
      });
      if (chosen.canceled || !chosen.filePaths[0]) return config.get();
      const pack = readSpritePack(await boundedFile(chosen.filePaths[0], PACK_FILE_LIMIT));
      const detail =
        ['idle', 'thinking', 'speaking']
          .map((state) => {
            const asset = pack.manifest.sprite[state as 'idle' | 'thinking' | 'speaking'];
            return `${state}: ${asset.mode}, ${asset.frameCount ?? 'automatic'} frames — ${asset.source}`;
          })
          .join('\n') +
        (pack.manifest.sprite.mouth.source ? '\nOptional mouth frames included.' : '') +
        (pack.manifest.persona
          ? `\nPersona “${pack.manifest.persona.name}” included. It will be kept in the library without activation until Persona support is available, unless the policy is Ignore.`
          : '');
      const answer = await dialog.showMessageBox(settingsOwner(), {
        type: 'question',
        title: 'Sprite Pack preview',
        message: `Import “${pack.manifest.name}”?`,
        detail,
        buttons: ['Cancel', 'Import'],
        cancelId: 0,
        defaultId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return config.get();
      await spriteManager.importPack(pack);
      return broadcast();
    },
    true,
  );
  handle(
    CHANNELS.packExport,
    emptySchema,
    z.boolean(),
    async () => {
      const chosen = await dialog.showSaveDialog(settingsOwner(), {
        title: 'Export Sprite Pack',
        defaultPath: 'Sprite Pack.zip',
        filters: [{ name: 'Sprite Pack', extensions: ['zip'] }],
      });
      if (chosen.canceled || !chosen.filePath) return false;
      const pack = await spriteManager.exportPack();
      await writeFile(chosen.filePath, writeSpritePack(pack.manifest, pack.files));
      return true;
    },
    true,
  );
  handle(CHANNELS.configGet, emptySchema, configResultSchema.options[0].shape.value, () =>
    config.get(),
  );
  handle(CHANNELS.secretSet, secretSetSchema, secretStatusSchema, (p) =>
    secrets.set(p.id, p.value),
  );
  handle(CHANNELS.secretHas, secretRequestSchema, secretStatusSchema, (p) => secrets.status(p.id));
  handle(CHANNELS.secretClear, secretRequestSchema, secretStatusSchema, (p) => secrets.clear(p.id));
  const providerFor = (cfg = config.get(), getKey?: () => Promise<string | undefined>) => {
    const provider = cfg.llm.provider;
    return createLLMProvider(
      cfg,
      getKey ??
        (async () =>
          provider === 'openai-compatible' || provider === 'anthropic'
            ? secrets.get(`llm.${provider}`)
            : undefined),
    );
  };
  const models = async () => {
    const instance = providerFor();
    if (!instance.listModels) throw new Error('Model discovery is not available for this provider');
    return instance.listModels();
  };
  handle(CHANNELS.llmModels, emptySchema, z.array(modelInfoSchema).max(10000), () => models());
  handle(CHANNELS.llmTest, emptySchema, connectionTestSchema, async () => {
    const start = performance.now(),
      cfg = config.get(),
      provider = cfg.llm.provider;
    const id =
      provider === 'openai-compatible' || provider === 'anthropic'
        ? (`llm.${provider}` as const)
        : null;
    const credentialRevision = id ? secrets.status(id).revision : '',
      key = id ? secrets.get(id) : undefined;
    const instance = providerFor(cfg, async () => key),
      controller = new AbortController();
    let complete = false;
    for await (const delta of instance.chat([{ role: 'user', content: 'Reply OK.' }], {
      signal: controller.signal,
      model: cfg.llm.model,
      maxTokens: 1,
      stream: false,
    })) {
      if (delta.type === 'error') throw new ProviderError(delta.error);
      if (delta.type === 'done') complete = true;
    }
    if (!complete) throw new Error('Connection test ended without a complete reply');
    const available = instance.listModels ? await instance.listModels() : [];
    return {
      model: cfg.llm.model,
      models: available,
      latencyMs: performance.now() - start,
      provider,
      baseUrl: cfg.llm.baseUrl,
      credentialRevision,
    };
  });
  const environment = async () =>
    settingsEnvironmentSchema.parse({
      displays: screen.getAllDisplays().map((display, index) => ({
        id: String(display.id),
        label: `Display ${index + 1} — ${Math.round(display.size.width * display.scaleFactor)}×${Math.round(display.size.height * display.scaleFactor)} @ ${Math.round(display.scaleFactor * 100)}%`,
      })),
      fonts: SETTINGS_FONTS,
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chromium: process.versions.chrome ?? '',
      node: process.versions.node,
      configPath: join(app.getPath('userData'), 'config.json'),
      packaged: app.isPackaged,
      updateFeedConfigured: false,
      historyWarning: history.warning,
    });
  handle(CHANNELS.settingsEnvironment, emptySchema, settingsEnvironmentSchema, environment);
  const updateEnvironment = () => {
    void environment().then((value) => {
      for (const win of BrowserWindow.getAllWindows())
        win.webContents.send(CHANNELS.settingsEnvironmentChanged, value);
    });
  };
  screen.on('display-added', updateEnvironment);
  screen.on('display-removed', updateEnvironment);
  screen.on('display-metrics-changed', updateEnvironment);
  handle(CHANNELS.appRestart, emptySchema, z.null(), () => {
    app.relaunch();
    app.quit();
    return null;
  });
  handle(CHANNELS.historyConfirmClear, emptySchema, z.boolean(), async () => {
    const window = getSettingsWindow();
    if (!window) throw new Error('Settings is closed');
    const answer = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Clear Conversation History',
      message: 'Clear Conversation History?',
      detail: 'This removes the current conversation and its saved history.',
      buttons: ['Cancel', 'Clear'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return answer.response === 1;
  });
  handle(CHANNELS.settingsResetPanel, resetPanelSchema, resetPanelResultSchema, async (p) => {
    const window = getSettingsWindow();
    if (!window) throw new Error('Settings is closed');
    const sections: Partial<Record<typeof p.panel, ConfigSection[]>> = {
      General: ['window', 'hotkeys', 'update'],
      Model: ['llm'],
      Appearance: ['bubble', 'input'],
      Sprites: ['sprite'],
    };
    const selected = sections[p.panel];
    if (!selected) throw new Error('Panel reset is not implemented yet');
    const answer = await dialog.showMessageBox(window, {
      type: 'question',
      title: 'Reset this panel to defaults',
      message: `Reset ${p.panel} to defaults?`,
      detail:
        p.panel === 'Model'
          ? 'This resets model controls and clears saved Model API keys.'
          : 'Your changes to this panel will be replaced with the default settings.',
      buttons: ['Cancel', 'Reset'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer.response !== 1) return { config: config.get(), reset: false };
    if (p.panel === 'Model') {
      secrets.clear('llm.openai-compatible');
      secrets.clear('llm.anthropic');
    }
    for (const section of selected) {
      if (section === 'sprite') await spriteManager.resetAll();
      else config.reset(section);
    }
    return { config: broadcast(), reset: true };
  });
  handle(CHANNELS.spriteAssets, emptySchema, spriteAssetsSchema, () =>
    sprites.assets(config.get().sprite, config.get().advanced.spriteCacheMb),
  );
  handle(CHANNELS.spriteMask, emptySchema, spriteMasksSchema, async () =>
    masks.masks(await sprites.assets(config.get().sprite, config.get().advanced.spriteCacheMb)),
  );
  handle(CHANNELS.configSet, configSetSchema, configResultSchema.options[0].shape.value, (p) => {
    config.set(p.section, p.value);
    return broadcast();
  });
  handle(
    CHANNELS.configPatch,
    configPatchSchema,
    configResultSchema.options[0].shape.value,
    async (p) => {
      if (p.section === 'sprite') await spriteManager.patch(p.value);
      else config.set(p.section, { ...config.get()[p.section], ...p.value });
      return broadcast();
    },
  );
  handle(
    CHANNELS.configReset,
    configResetSchema,
    configResultSchema.options[0].shape.value,
    (p) => {
      config.reset(p.section);
      return broadcast();
    },
  );
  handle(
    CHANNELS.windowSettings,
    settingsRequestSchema,
    voidResultSchema.options[0].shape.value,
    (p) => {
      settings(p.panel);
      return null;
    },
  );
  handle(CHANNELS.shellOpenExternal, externalUrlSchema, z.null(), async (p) => {
    await shell.openExternal(p.url);
    return null;
  });
  handle(CHANNELS.clipboardCopy, copyTextSchema, z.null(), async (p) => {
    await clipboard.writeText(p.text);
    return null;
  });
}
