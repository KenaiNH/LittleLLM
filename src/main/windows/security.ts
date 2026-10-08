import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
export const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
let allowOutput: (contents: Electron.WebContents | null) => boolean = () => false;
export function configureOutputPermissions(
  rule: (contents: Electron.WebContents | null) => boolean,
) {
  allowOutput = rule;
}
export function secureWindow(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      permission === 'speaker-selection' &&
        details.isMainFrame &&
        details.requestingUrl === contents.mainFrame.url &&
        allowOutput(contents),
    ),
  );
  win.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      permission === 'speaker-selection' &&
      Boolean(contents) &&
      details.isMainFrame &&
      details.requestingUrl === contents?.mainFrame.url &&
      allowOutput(contents),
  );
}
export async function loadRenderer(win: BrowserWindow, view: string): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL)
    await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/?view=${encodeURIComponent(view)}`);
  else
    await win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)), {
      query: { view },
    });
}
