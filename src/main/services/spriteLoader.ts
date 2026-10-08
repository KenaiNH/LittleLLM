import { copyFile,mkdir,realpath,readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join,resolve,sep } from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { REQUIRED_SPRITE_STATES } from '../../shared/enums';
import { relativePathSchema,type SpriteConfig } from '../../shared/config';
import { spriteAssetsSchema,type SpriteAssets } from '../../shared/sprites';
import { decodeImage } from './imageDecoder';
const natural=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export const naturalSort=(files:string[])=>files.sort((a,b)=>natural.compare(a,b)||a.localeCompare(b));
export class SpriteLoader {
  readonly root:string;
  private pending=new Map<string,Promise<SpriteAssets>>();
  constructor(userData:string){this.root=join(userData,'sprites');}
  async initialize():Promise<void>{for(const state of REQUIRED_SPRITE_STATES){const dir=join(this.root,state);await mkdir(dir,{recursive:true});const source=join(dir,'default.png');try{await realpath(source);}catch{await copyFile(fileURLToPath(new URL(`../../assets/default-sprites/${state}.png`,import.meta.url)),source);}}}
  async resolveAsset(state:string,source:string):Promise<string>{
    if(!['idle','thinking','speaking','listening','mouth'].includes(state))throw new Error('Invalid state');
    relativePathSchema.parse(source);const root=await realpath(join(this.root,state));const path=await realpath(join(root,source));if(!path.startsWith(root+sep))throw new Error('Asset leaves managed sprite folder');return path;
  }
  async assets(cfg:SpriteConfig,budgetMb=128):Promise<SpriteAssets>{
    const key=JSON.stringify([cfg,budgetMb]);const pending=this.pending.get(key);if(pending)return pending;
    const operation=this.loadAssets(cfg,budgetMb);this.pending.set(key,operation);try{return await operation;}finally{this.pending.delete(key);}
  }
  private async loadAssets(cfg:SpriteConfig,budgetMb:number):Promise<SpriteAssets>{
    let remaining=budgetMb*1024*1024;const assets:Record<string,unknown>={};
    const states=[...REQUIRED_SPRITE_STATES,...(cfg.listeningBehavior==='custom'&&cfg.listening?['listening'] as const:[])];
    for(const state of states){const spec=cfg[state];if(!spec)continue;const path=await this.resolveAsset(state,spec.source);
      const paths=spec.mode==='frames'?await Promise.all(naturalSort((await readdir(path)).filter(name=>/\.(png|webp|gif|apng)$/i.test(name))).map(name=>this.resolveAsset(state,spec.source+'/'+name))):[path];
      if(!paths.length||paths.length>512)throw new Error('Sprite needs 1–512 frames');
      const content=await Promise.all(paths.map(path=>readFile(path)));const hash=createHash('sha256').update(JSON.stringify(spec));for(const bytes of content)hash.update(bytes);const id=hash.digest('hex').slice(0,24);
      const dir=join(this.root,state,'decoded',id);await mkdir(dir,{recursive:true});
      const frames:{url:string;delayMs:number}[]=[];let width=0,height=0;
      for(const source of paths){const decoded=await decodeImage(source,spec.mode==='frames'?{...spec,mode:'static',gifTimingSource:'override'}:spec,remaining);for(const frame of spec.mode==='frames'?decoded.slice(0,1):decoded){remaining-=frame.width*frame.height*4;if(remaining<0)throw new Error('Sprite cache budget exceeded');if(width&&(width!==frame.width||height!==frame.height))throw new Error('Sequence frames must have equal dimensions');width=frame.width;height=frame.height;const relative=`decoded/${id}/${frames.length}.png`;const file=join(this.root,state,relative);try{await realpath(file);}catch{await sharp(frame.pixels,{raw:{width,height,channels:4}}).png().toFile(file);}frames.push({url:`companion://sprites/${state}/${relative}`,delayMs:frame.delayMs});}}
      if(frames.length>512)throw new Error('Too many decoded frames');await writeFile(join(dir,'metadata.json'),JSON.stringify({width,height,frames}));assets[state]={width,height,frames};
    }
    return spriteAssetsSchema.parse(assets);
  }
  async protocolPath(url:URL):Promise<string>{if(url.hostname!=='sprites')throw new Error('Invalid asset host');const parts=url.pathname.split('/').filter(Boolean);const state=parts.shift();if(!state)throw new Error('Missing sprite state');return this.resolveAsset(state,decodeURIComponent(parts.join('/')));}
}
export function managedPath(root:string,source:string):string{relativePathSchema.parse(source);const path=resolve(root,source);if(!path.startsWith(resolve(root)+sep))throw new Error('Asset outside managed folder');return path;}
