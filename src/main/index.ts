import { app, dialog, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeRuntime } from './services/nativeRuntime';
import { Logger } from './services/logger';
import { configureNetwork } from './services/network';
import { recoverConfig } from './services/configRecovery';
import { performanceProbe } from './services/performanceProbe';
import { ConfigStore } from './services/configStore';
import { openSettings } from './windows/settingsWindow';
import { createPetWindow } from './windows/petWindow';
import { registerHandlers } from './ipc/handlers';
import { SpriteLoader } from './services/spriteLoader';
import { InputWindow } from './windows/inputWindow';
import { OutputImages } from './services/outputImages';
import { SecretStore } from './services/secretStore';
import { ConversationStore } from './services/conversationStore';
import { PersonaManager } from './services/personaManager';
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'companion',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
const testData = process.env.LITTLELLM_TEST_USER_DATA;
if (testData) app.setPath('userData', testData);
try {
  if (
    !recoverConfig(JSON.parse(readFileSync(join(app.getPath('userData'), 'config.json'), 'utf8')))
      .config.advanced.hardwareAcceleration
  )
    app.disableHardwareAcceleration();
} catch {
  /* ConfigStore handles missing, invalid and future configurations after ready. */
}
app.setAppUserModelId('com.littlellm.companion');
let runtime: NativeRuntime | undefined;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => runtime?.focus());
  void app.whenReady().then(async () => {
    mkdirSync(app.getPath('userData'), { recursive: true });
    let config: ConfigStore;
    try {
      config = new ConfigStore(app.getPath('userData'));
    } catch {
      dialog.showErrorBox(
        'Settings cannot be loaded',
        'This settings file was created by a newer version of the app.',
      );
      app.quit();
      return;
    }
    const sprites = new SpriteLoader(app.getPath('userData'));
    await sprites.initialize();
    const outputImages = new OutputImages();
    protocol.handle('companion', async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname === 'images') {
          const buffer = await outputImages.get(decodeURIComponent(url.pathname.slice(1)));
          return new Response(new Uint8Array(buffer), {
            headers: {
              'Content-Type': 'image/png',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'private, max-age=3600',
            },
          });
        }
        const response = await net.fetch(pathToFileURL(await sprites.protocolPath(url)).href);
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    const secrets = new SecretStore(app.getPath('userData'));
    const history = new ConversationStore(app.getPath('userData'));
    const personas = new PersonaManager(config);
    await personas.patch({});
    const logger = new Logger(app.getPath('userData'), () => config.get());
    app.on('web-contents-created', (_event, contents) =>
      contents.on('render-process-gone', (_event, details) =>
        logger.write('error', 'renderer.gone', {
          reason: details.reason,
          exitCode: details.exitCode,
        }),
      ),
    );
    app.on('child-process-gone', (_event, details) =>
      logger.write('error', 'child.gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
      }),
    );
    config.onChange((section) => logger.write('debug', 'settings.changed', { section }));
    await configureNetwork(config);
    runtime = new NativeRuntime(config, personas, openSettings, logger);
    registerHandlers(config, openSettings, sprites, secrets, history, personas, runtime);
    const pet = await createPetWindow(
      config,
      openSettings,
      (pet) => {
        const input = new InputWindow(config, pet, secrets, history);
        runtime?.attach(pet, input);
        personas.bind({
          hasConversation: () => input.hasConversation,
          clearConversation: () => input.clearConversation(),
          context: () => input.personaContext(),
        });
      },
      async () =>
        (await sprites.assets(config.get().sprite, config.get().advanced.spriteCacheMb)).idle,
    );
    if (testData && process.env.LITTLELLM_MEASURE_PERFORMANCE === '1') {
      void performanceProbe(
        pet,
        testData,
        Number(process.env.LITTLELLM_MEASURE_STARTED) || Date.now(),
      );
    }
    logger.write('info', 'app.ready', { version: app.getVersion(), packaged: app.isPackaged });
    if (config.firstRun && (!testData || process.env.LITTLELLM_TEST_FIRST_RUN === '1'))
      openSettings('Model');
    if (config.backupPath && !testData)
      await dialog.showMessageBox({
        type: 'warning',
        message: 'Some settings were invalid and have been restored.',
        detail: `Backup: ${config.backupPath}`,
      });
  });
  app.on('window-all-closed', () => app.quit());
}
