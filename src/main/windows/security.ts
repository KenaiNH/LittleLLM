import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
export const preloadPath=fileURLToPath(new URL('../preload/index.cjs',import.meta.url));
export function secureWindow(win:BrowserWindow):void{
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  win.webContents.session.setPermissionCheckHandler(()=>false);
}
export async function loadRenderer(win:BrowserWindow,view:string):Promise<void>{
  if(process.env.ELECTRON_RENDERER_URL)await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/?view=${encodeURIComponent(view)}`);
  else await win.loadFile(fileURLToPath(new URL('../renderer/index.html',import.meta.url)),{query:{view}});
}
