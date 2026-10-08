import { BrowserWindow,ipcMain } from 'electron';
import { z } from 'zod';
import { CHANNELS } from './channels';
import { emptySchema,configSetSchema,configResetSchema,configResultSchema,settingsRequestSchema,voidResultSchema,resultSchema } from './schemas';
import type { ConfigStore } from '../services/configStore';
import { normalizeError } from '../../shared/errors';
import type { SpriteLoader } from '../services/spriteLoader';
import { spriteAssetsSchema } from '../../shared/sprites';
export function registerHandlers(config:ConfigStore,settings:(panel:string)=>void,sprites:SpriteLoader):void{
  const handle=<S extends z.ZodTypeAny,R extends z.ZodTypeAny>(channel:string,request:S,response:R,handler:(payload:z.output<S>)=>z.input<R>|Promise<z.input<R>>)=>{
    ipcMain.handle(channel,async(event,payload:unknown)=>{
      try{if(!BrowserWindow.fromWebContents(event.sender)||event.senderFrame!==event.sender.mainFrame)throw new Error('Untrusted IPC sender');return resultSchema(response).parse({ok:true,value:await handler(request.parse(payload))});}
      catch(error){return {ok:false,error:normalizeError(error)};}
    });
  };
  const broadcast=()=>{const value=config.get();for(const win of BrowserWindow.getAllWindows())win.webContents.send(CHANNELS.configChanged,value);return value;};
  handle(CHANNELS.configGet,emptySchema,configResultSchema.options[0].shape.value,()=>config.get());
  handle(CHANNELS.spriteAssets,emptySchema,spriteAssetsSchema,()=>sprites.assets(config.get().sprite));
  handle(CHANNELS.configSet,configSetSchema,configResultSchema.options[0].shape.value,p=>{config.set(p.section,p.value);return broadcast();});
  handle(CHANNELS.configReset,configResetSchema,configResultSchema.options[0].shape.value,p=>{config.reset(p.section);return broadcast();});
  handle(CHANNELS.windowSettings,settingsRequestSchema,voidResultSchema.options[0].shape.value,p=>{settings(p.panel);return null;});
}
