import { useEffect,useRef } from 'react';
import type { SpriteAssets } from '../../shared/sprites';
import type { SpriteConfig } from '../../shared/config';
import type { SpriteState } from '../../shared/enums';
import styles from './Sprite.module.css';
export function Sprite({assets,config,state}:{assets:SpriteAssets;config:SpriteConfig;state:SpriteState}){
  const ref=useRef<HTMLCanvasElement>(null);
  const selected=state==='listening'?'idle':state;const asset=assets[selected];
  useEffect(()=>window.companion.resizePet(Math.ceil(asset.width*config.scale),Math.ceil(asset.height*config.scale)),[asset,config.scale]);
  useEffect(()=>{let disposed=false;const bitmaps:ImageBitmap[]=[];void Promise.all(['idle','thinking','speaking'].map(async state=>{const entry=assets[state as 'idle'];if(!entry.frames[0])return;const response=await fetch(entry.frames[0].url);if(!response.ok)throw new Error('Sprite asset could not be loaded');const bitmap=await createImageBitmap(await response.blob());if(disposed){bitmap.close();return;}bitmaps.push(bitmap);return[state,bitmap] as const;})).then(entries=>{if(disposed)return;const bitmap=entries.find(entry=>entry?.[0]===selected)?.[1];const canvas=ref.current;const ctx=canvas?.getContext('2d');if(!canvas||!ctx||!bitmap)return;canvas.width=asset.width*config.scale;canvas.height=asset.height*config.scale;ctx.imageSmoothingEnabled=config.pixelated==='off'||(config.pixelated==='auto'&&Math.max(asset.width,asset.height)>128);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);}).catch(error=>{console.error(error);if(ref.current)ref.current.dataset.error='Sprite image decode failed';});return()=>{disposed=true;for(const bitmap of bitmaps)bitmap.close();};},[assets,asset,config,selected]);
  return <canvas ref={ref} data-testid="sprite" aria-label={`${state} companion sprite`} className={styles.sprite} style={{width:asset.width*config.scale,height:asset.height*config.scale,opacity:config.opacity}}/>;
}
