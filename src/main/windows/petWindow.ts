import { BrowserWindow,screen,powerMonitor,Menu,app,ipcMain } from 'electron';
import { resizeSchema,booleanSchema,moveSchema } from '../ipc/schemas';
import { CHANNELS } from '../ipc/channels';
import type { ConfigStore } from '../services/configStore';
import { preloadPath,secureWindow,loadRenderer } from './security';
import { clampPosition,defaultPosition,snapPosition } from './placement';
export async function createPetWindow(config:ConfigStore,settings:(panel:string)=>void,created?:(win:BrowserWindow)=>void):Promise<BrowserWindow>{
  const cfg=config.get().window;const size={width:128,height:128};
  const displays=screen.getAllDisplays();const display=cfg.displayTarget==='cursor'?screen.getDisplayNearestPoint(screen.getCursorScreenPoint()):displays.find(d=>String(d.id)===cfg.displayTarget)??screen.getPrimaryDisplay();
  const saved=cfg.restorePosition?cfg.positions[String(display.id)]:undefined;
  const position=clampPosition(saved??defaultPosition(size,display.workArea,cfg.defaultAnchor,cfg.edgeMarginPx),size,display.workArea);
  const win=new BrowserWindow({...size,...position,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,skipTaskbar:!cfg.showInTaskbar,hasShadow:false,alwaysOnTop:true,fullscreenable:false,focusable:true,show:false,webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  secureWindow(win);win.setAlwaysOnTop(true,'screen-saver');win.setVisibleOnAllWorkspaces(cfg.allWorkspaces,{visibleOnFullScreen:false});win.setContentProtection(cfg.contentProtection);
  win.once('ready-to-show',()=>{if(!cfg.startMinimized)win.showInactive();});
  const reassert=()=>{if(!win.isDestroyed()){win.setAlwaysOnTop(true,'screen-saver');const bounds=win.getBounds();const current=screen.getDisplayMatching(bounds);const p=clampPosition(bounds,bounds,current.workArea);win.setPosition(p.x,p.y);win.webContents.send(CHANNELS.windowDpi,{scaleFactor:current.scaleFactor});}};
  screen.on('display-metrics-changed',reassert);screen.on('display-removed',reassert);powerMonitor.on('resume',reassert);
  let timer:ReturnType<typeof setTimeout>|undefined;
  let anchorOffset={x:0,y:0};
  win.on('move',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(win.isDestroyed())return;const bounds=win.getBounds(),current=screen.getDisplayMatching(bounds),now=config.get().window;const snap=now.snapToEdges?snapPosition(bounds,bounds,current.workArea,now.snapDistancePx):bounds;const p=now.keepOnScreen?clampPosition(snap,bounds,current.workArea):snap;if(p.x!==bounds.x||p.y!==bounds.y)win.setPosition(p.x,p.y);config.set('window',{...now,positions:{...now.positions,[String(current.id)]:{x:p.x+anchorOffset.x,y:p.y+anchorOffset.y}}});},150);});
  win.on('show',()=>win.webContents.send(CHANNELS.windowVisibility,{visible:true}));win.on('hide',()=>win.webContents.send(CHANNELS.windowVisibility,{visible:false}));
  ipcMain.on(CHANNELS.windowIgnoreMouse,(event,value:unknown)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return;const parsed=booleanSchema.safeParse(value);if(parsed.success)win.setIgnoreMouseEvents(config.get().advanced.clickThrough==='never'?false:parsed.data,{forward:true});});
  ipcMain.on(CHANNELS.windowMove,(event,value:unknown)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!config.get().advanced.dragEnabled)return;const parsed=moveSchema.safeParse(value);if(!parsed.success)return;const bounds=win.getBounds(),area=screen.getDisplayNearestPoint(parsed.data).workArea,p=config.get().window.keepOnScreen?clampPosition(parsed.data,bounds,area):parsed.data;win.setPosition(Math.round(p.x),Math.round(p.y));});
  ipcMain.on(CHANNELS.windowResize,(event,value:unknown)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return;const payload=resizeSchema.safeParse(value);if(!payload.success)return;const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea;const size={width:Math.min(payload.data.width,area.width),height:Math.min(payload.data.height,area.height)};const p=clampPosition({x:bounds.x+bounds.width-size.width,y:bounds.y+bounds.height-size.height},size,area);anchorOffset=payload.data.anchor?{x:payload.data.anchor.x,y:payload.data.anchor.y}:{x:0,y:0};win.setBounds({...p,...size});});
  win.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'Settings',click:()=>settings('General')},{label:'Hide',click:()=>win.hide()},{label:'Quit',click:()=>app.quit()}]).popup({window:win}));
  win.once('closed',()=>{clearTimeout(timer);screen.removeListener('display-metrics-changed',reassert);screen.removeListener('display-removed',reassert);powerMonitor.removeListener('resume',reassert);});
  created?.(win);await loadRenderer(win,'pet');return win;
}
