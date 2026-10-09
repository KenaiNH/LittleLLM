import { BrowserWindow, screen } from 'electron';
import { preloadPath, secureWindow, loadRenderer, recoverRenderer } from './security';
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
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  // Leave room for native-frame/DPI rounding at the work-area edges.
  const width = Math.min(960, Math.max(1, area.width - 16));
  const height = Math.min(680, Math.max(1, area.height - 16));
  settings = new BrowserWindow({
    title: 'Settings',
    width,
    height,
    minWidth: Math.min(820, width),
    minHeight: Math.min(560, height),
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
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
  recoverRenderer(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    settings = undefined;
  });
  void loadRenderer(win, `settings:${panel}`);
}
