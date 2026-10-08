import { app,BrowserWindow,ipcMain,screen } from 'electron';
import { z } from 'zod';
import type { ConfigStore } from '../services/configStore';
import { CHANNELS } from '../ipc/channels';
import { emptySchema,resultSchema } from '../ipc/schemas';
import { chatUiSchema,draftSchema,submitSchema,type ChatUi } from '../../shared/chatUi';
import { normalizeError } from '../../shared/errors';
import { preloadPath,secureWindow,loadRenderer } from './security';

export class InputWindow {
  private state:ChatUi={inputOpen:false,draft:'',echo:null};
  private win:BrowserWindow|null=null;
  private ready:Promise<void>|null=null;
  private quitting=false;
  constructor(private config:ConfigStore,private pet:BrowserWindow){
    const trusted=(event:Electron.IpcMainEvent|Electron.IpcMainInvokeEvent)=>event.senderFrame===event.sender.mainFrame&&(event.sender===this.win?.webContents||event.sender===pet.webContents);
    const handle=<S extends z.ZodTypeAny,R extends z.ZodTypeAny>(channel:string,request:S,response:R,action:(payload:z.output<S>)=>z.input<R>|Promise<z.input<R>>)=>ipcMain.handle(channel,async(event,payload:unknown)=>{try{if(!trusted(event))throw new Error('Untrusted chat sender');return resultSchema(response).parse({ok:true,value:await action(request.parse(payload))});}catch(error){return{ok:false,error:normalizeError(error)};}});
    handle(CHANNELS.chatUiGet,emptySchema,chatUiSchema,()=>this.state);
    handle(CHANNELS.inputToggle,emptySchema,z.null(),async()=>{if(this.state.inputOpen)this.close();else await this.open();return null;});
    handle(CHANNELS.inputClose,emptySchema,z.null(),()=>{this.close();return null;});
    handle(CHANNELS.inputSubmit,submitSchema,z.null(),p=>{
      // Build phase 6 echo. The LLM milestone replaces this with real generation.
      this.state={...this.state,draft:'',echo:{name:'You',text:p.text}};
      if(!this.config.get().input.keepOpenAfterSend)this.close();else this.broadcast();return null;
    });
    ipcMain.on(CHANNELS.inputDraft,(event,payload:unknown)=>{if(!trusted(event)||event.sender!==this.win?.webContents)return;const parsed=draftSchema.safeParse(payload);if(parsed.success)this.state={...this.state,draft:parsed.data.text};});
    screen.on('display-metrics-changed',this.position);screen.on('display-removed',this.position);
    pet.on('move',this.position);pet.on('hide',()=>this.close());
    app.on('before-quit',this.beforeQuit);
    pet.once('closed',()=>{screen.removeListener('display-metrics-changed',this.position);screen.removeListener('display-removed',this.position);app.removeListener('before-quit',this.beforeQuit);this.win?.destroy();});
  }
  private beforeQuit=()=>{this.quitting=true;};
  private initialize(){if(this.ready)return this.ready;const win=new BrowserWindow({width:1280,height:167,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,fullscreenable:false,show:false,webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:true}});this.win=win;secureWindow(win);win.setAlwaysOnTop(true,'screen-saver');win.on('close',event=>{if(!this.quitting){event.preventDefault();this.close();}});this.ready=loadRenderer(win,'input');return this.ready;}
  private position=()=>{if(!this.win||this.win.isDestroyed()||this.pet.isDestroyed())return;const area=screen.getDisplayMatching(this.pet.getBounds()).workArea;const cfg=this.config.get(),width=Math.min(area.width,cfg.input.width==='wide'?area.width:cfg.input.width==='compact'?280:cfg.bubble.baseWidthPx*cfg.bubble.scale),height=Math.min(167,area.height);this.win.setBounds({x:area.x+area.width-width,y:area.y+area.height-height,width:Math.round(width),height});};
  private broadcast(){for(const win of [this.pet,this.win])if(win&&!win.isDestroyed())win.webContents.send(CHANNELS.chatUiChanged,this.state);}
  async open(){this.state={...this.state,inputOpen:true};await this.initialize();if(!this.state.inputOpen||!this.win||this.win.isDestroyed())return;this.position();this.win.show();this.win.focus();this.broadcast();}
  close(){this.state={...this.state,inputOpen:false,draft:this.config.get().input.rememberDraft?this.state.draft:''};this.win?.hide();this.broadcast();}
}
