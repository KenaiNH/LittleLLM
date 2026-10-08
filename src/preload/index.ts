import { contextBridge,ipcRenderer } from 'electron';
import { configSchema } from '../shared/config';
import { CHANNELS } from '../main/ipc/channels';
import { emptySchema,configSetSchema,configResetSchema,configResultSchema,settingsRequestSchema,voidResultSchema,resultSchema,resizeSchema,visibilitySchema,dpiSchema,booleanSchema,moveSchema } from '../main/ipc/schemas';
import { spriteAssetsSchema,spriteMasksSchema } from '../shared/sprites';
import type { CompanionAPI } from '../shared/api';
const api:CompanionAPI={
  getConfig:async()=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configGet,emptySchema.parse({}))),
  getSpriteAssets:async()=>resultSchema(spriteAssetsSchema).parse(await ipcRenderer.invoke(CHANNELS.spriteAssets,emptySchema.parse({}))),
  getSpriteMasks:async()=>resultSchema(spriteMasksSchema).parse(await ipcRenderer.invoke(CHANNELS.spriteMask,emptySchema.parse({}))),
  setIgnoreMouse:ignore=>ipcRenderer.send(CHANNELS.windowIgnoreMouse,booleanSchema.parse(ignore)),
  movePet:(x,y)=>ipcRenderer.send(CHANNELS.windowMove,moveSchema.parse({x,y})),
  resizePet:(width,height)=>ipcRenderer.send(CHANNELS.windowResize,resizeSchema.parse({width,height})),
  onVisibility:callback=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=visibilitySchema.safeParse(value);if(parsed.success)callback(parsed.data.visible);};ipcRenderer.on(CHANNELS.windowVisibility,listener);return()=>ipcRenderer.removeListener(CHANNELS.windowVisibility,listener);},
  onDpi:callback=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=dpiSchema.safeParse(value);if(parsed.success)callback(parsed.data.scaleFactor);};ipcRenderer.on(CHANNELS.windowDpi,listener);return()=>ipcRenderer.removeListener(CHANNELS.windowDpi,listener);},
  setConfig:async(section,value)=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configSet,configSetSchema.parse({section,value}))),
  resetConfig:async(section)=>configResultSchema.parse(await ipcRenderer.invoke(CHANNELS.configReset,configResetSchema.parse({section}))),
  onConfig:callback=>{const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>{const parsed=configSchema.safeParse(value);if(parsed.success)callback(parsed.data);};ipcRenderer.on(CHANNELS.configChanged,listener);return()=>ipcRenderer.removeListener(CHANNELS.configChanged,listener);},
  openSettings:async(panel='General')=>voidResultSchema.parse(await ipcRenderer.invoke(CHANNELS.windowSettings,settingsRequestSchema.parse({panel}))),
};
contextBridge.exposeInMainWorld('companion',api);
