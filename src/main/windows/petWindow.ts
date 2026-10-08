import { BrowserWindow,screen,powerMonitor,Menu,app } from 'electron';
import { CHANNELS } from '../ipc/channels';
import type { ConfigStore } from '../services/configStore';
import { preloadPath,secureWindow,loadRenderer } from './security';
import { clampPosition,defaultPosition,snapPosition } from './placement';
export async function createPetWindow(config:ConfigStore,settings:(panel:string)=>void):Promise<BrowserWindow>{
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
  win.on('move',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(win.isDestroyed())return;const bounds=win.getBounds(),current=screen.getDisplayMatching(bounds),now=config.get().window;const snap=now.snapToEdges?snapPosition(bounds,bounds,current.workArea,now.snapDistancePx):bounds;const p=now.keepOnScreen?clampPosition(snap,bounds,current.workArea):snap;if(p.x!==bounds.x||p.y!==bounds.y)win.setPosition(p.x,p.y);config.set('window',{...now,positions:{...now.positions,[String(current.id)]:p}});},150);});
  win.on('show',()=>win.webContents.send(CHANNELS.windowVisibility,{visible:true}));win.on('hide',()=>win.webContents.send(CHANNELS.windowVisibility,{visible:false}));
  win.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'Settings',click:()=>settings('General')},{label:'Hide',click:()=>win.hide()},{label:'Quit',click:()=>app.quit()}]).popup({window:win}));
  win.once('closed',()=>{clearTimeout(timer);screen.removeListener('display-metrics-changed',reassert);screen.removeListener('display-removed',reassert);powerMonitor.removeListener('resume',reassert);});
  await loadRenderer(win,'pet');return win;
}
