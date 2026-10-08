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
export function registerHandlers(
  config: ConfigStore,
  settings: (panel: string) => void,
  sprites: SpriteLoader,
  secrets: SecretStore,
  history: ConversationStore,
): void {
  const masks = new AlphaMaskCache(app.getPath('userData'), sprites);
  const handle = <S extends z.ZodTypeAny, R extends z.ZodTypeAny>(
    channel: string,
    request: S,
    response: R,
    handler: (payload: z.output<S>) => z.input<R> | Promise<z.input<R>>,
  ) => {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      try {
        if (
          !BrowserWindow.fromWebContents(event.sender) ||
          event.senderFrame !== event.sender.mainFrame
        )
          throw new Error('Untrusted IPC sender');
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
      displays: screen
        .getAllDisplays()
        .map((display, index) => ({
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
    for (const section of selected) config.reset(section);
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
    (p) => {
      config.set(p.section, { ...config.get()[p.section], ...p.value });
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
