import { BrowserWindow, ipcMain, shell, clipboard } from 'electron';
import { z } from 'zod';
import { CHANNELS } from './channels';
import {
  emptySchema,
  configSetSchema,
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
import { draftSchema } from '../../shared/chatUi';
export function registerHandlers(
  config: ConfigStore,
  settings: (panel: string) => void,
  sprites: SpriteLoader,
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
        return { ok: false, error: normalizeError(error) };
      }
    });
  };
  const broadcast = () => {
    const value = config.get();
    for (const win of BrowserWindow.getAllWindows())
      win.webContents.send(CHANNELS.configChanged, value);
    return value;
  };
  handle(CHANNELS.configGet, emptySchema, configResultSchema.options[0].shape.value, () =>
    config.get(),
  );
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
  handle(CHANNELS.clipboardCopy, draftSchema, z.null(), async (p) => {
    await clipboard.writeText(p.text);
    return null;
  });
}
