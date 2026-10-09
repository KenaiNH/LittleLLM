import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
export const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
let allowOutput: (contents: Electron.WebContents | null) => boolean = () => false;
let allowMicrophone: (contents: Electron.WebContents | null) => boolean = () => false;
export function configureMicrophonePermissions(rule: typeof allowMicrophone) {
  allowMicrophone = rule;
}
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
      details.isMainFrame &&
        details.requestingUrl === contents.mainFrame.url &&
        ((permission === 'speaker-selection' && allowOutput(contents)) ||
          (permission === 'media' &&
            'mediaTypes' in details &&
            details.mediaTypes?.length === 1 &&
            details.mediaTypes[0] === 'audio' &&
            allowMicrophone(contents))),
    ),
  );
  win.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      Boolean(contents) &&
      details.isMainFrame &&
      details.requestingUrl === contents?.mainFrame.url &&
      ((permission === 'speaker-selection' && allowOutput(contents)) ||
        (permission === 'media' && details.mediaType === 'audio' && allowMicrophone(contents))),
  );
}
export function recoverRenderer(win: BrowserWindow, cancel: () => void = () => undefined) {
  let attempts: number[] = [];
  win.webContents.on('render-process-gone', () => {
    cancel();
    attempts = [...attempts.filter((time) => Date.now() - time < 60000), Date.now()];
    if (attempts.length > 2 || win.isDestroyed()) return;
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 250);
  });
}
export async function loadRenderer(win: BrowserWindow, view: string): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL)
    await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/?view=${encodeURIComponent(view)}`);
  else
    await win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)), {
      query: { view },
    });
}
