import { contextBridge,ipcRenderer } from 'electron';
import { configSchema } from '../shared/config';
import { CHANNELS } from '../main/ipc/channels';
import { emptySchema,configSetSchema,configResetSchema,configResultSchema,settingsRequestSchema,voidResultSchema } from '../main/ipc/schemas';
import type { CompanionAPI } from '../shared/api';
const api:CompanionAPI={
  getConfig:async()=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configGet,emptySchema.parse({}))),
  setConfig:async(section,value)=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configSet,configSetSchema.parse({section,value}))),
  resetConfig:async(section)=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configReset,configResetSchema.parse({section}))),
  onConfig:callback=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=configSchema.safeParse(value);if(parsed.success)callback(parsed.data);};ipcRenderer.on(CHANNELS.configChanged,listener);return()=>ipcRenderer.removeListener(CHANNELS.configChanged,listener);},
  openSettings:async(panel='General')=>voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.windowSettings,settingsRequestSchema.parse({panel}))),
};
contextBridge.exposeInMainWorld('companion',api);
