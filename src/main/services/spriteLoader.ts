import { copyFile,mkdir,realpath } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { REQUIRED_SPRITE_STATES } from '../../shared/enums';
import { relativePathSchema,type SpriteConfig } from '../../shared/config';
import { spriteAssetsSchema,type SpriteAssets } from '../../shared/sprites';
export class SpriteLoader {
  readonly root:string;
  constructor(userData:string){this.root=join(userData,'sprites');}
  async initialize():Promise<void>{for(const state of REQUIRED_SPRITE_STATES){const dir=join(this.root,state);await mkdir(dir,{recursive:true});const source=join(dir,'default.png');try{await realpath(source);}catch{await copyFile(fileURLToPath(new URL(`../../assets/default-sprites/${state}.png`,import.meta.url)),source);}}}
  async resolveAsset(state:string,source:string):Promise<string>{
    if(!['idle','thinking','speaking','listening','mouth'].includes(state))throw new Error('Invalid state');
    relativePathSchema.parse(source);const root=await realpath(join(this.root,state));const path=await realpath(join(root,source));if(!path.startsWith(root+sep))throw new Error('Asset leaves managed sprite folder');return path;
  }
  async assets(cfg:SpriteConfig):Promise<SpriteAssets>{
    const assets:Record<string,unknown>={};for(const state of REQUIRED_SPRITE_STATES){const path=await this.resolveAsset(state,cfg[state].source);const meta=await sharp(path).metadata();if(!meta.width||!meta.height)throw new Error('Invalid sprite image');assets[state]={width:meta.width,height:meta.height,frames:[{url:`companion://sprites/${state}/${encodeURIComponent(cfg[state].source)}`,delayMs:1000/cfg[state].fps}]};}return spriteAssetsSchema.parse(assets);
  }
  async protocolPath(url:URL):Promise<string>{if(url.hostname!=='sprites')throw new Error('Invalid asset host');const parts=url.pathname.split('/').filter(Boolean);const state=parts.shift();if(!state)throw new Error('Missing sprite state');return this.resolveAsset(state,decodeURIComponent(parts.join('/')));}
}
export function managedPath(root:string,source:string):string{relativePathSchema.parse(source);const path=resolve(root,source);if(!path.startsWith(resolve(root)+sep))throw new Error('Asset outside managed folder');return path;}
