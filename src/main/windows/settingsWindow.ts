import { BrowserWindow } from 'electron';
import { preloadPath, secureWindow, loadRenderer } from './security';
import { CHANNELS } from '../ipc/channels';
let settings: BrowserWindow | undefined;
export const getSettingsWindow = () => settings;
export function openSettings(panel: string): void {
  if (settings && !settings.isDestroyed()) {
    settings.show();
    settings.focus();
    settings.webContents.send(CHANNELS.settingsPanel, panel);
    return;
  }
  settings = new BrowserWindow({
    title: 'Settings',
    width: 960,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const win = settings;
  win.removeMenu();
  secureWindow(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    settings = undefined;
  });
  void loadRenderer(win, `settings:${panel}`);
}
