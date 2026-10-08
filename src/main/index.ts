import { app, dialog, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { ConfigStore } from './services/configStore';
import { openSettings } from './windows/settingsWindow';
import { createPetWindow } from './windows/petWindow';
import { registerHandlers } from './ipc/handlers';
import { SpriteLoader } from './services/spriteLoader';
import { InputWindow } from './windows/inputWindow';
import { OutputImages } from './services/outputImages';
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'companion',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
const testData = process.env.LITTLELLM_TEST_USER_DATA;
if (testData) app.setPath('userData', testData);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings('General'));
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
    registerHandlers(config, openSettings, sprites);
    await createPetWindow(config, openSettings, (pet) => {
      new InputWindow(config, pet);
    });
    if (config.backupPath && !testData)
      await dialog.showMessageBox({
        type: 'warning',
        message: 'Some settings were invalid and have been restored.',
        detail: `Backup: ${config.backupPath}`,
      });
  });
  app.on('window-all-closed', () => app.quit());
}
