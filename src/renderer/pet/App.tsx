import { useEffect,useRef,useState } from 'react';
import { usePetStore } from './store';
import { Sprite } from './Sprite';
import { useSpriteInteraction } from './useSpriteInteraction';
import type { ChatUi } from '../../shared/chatUi';
import { StaticBubble } from './StaticBubble';
import styles from './App.module.css';
export function PetApp(){const {config,assets,state,error,initialize,setState}=usePetStore();const ref=useRef<HTMLDivElement>(null),[ui,setUi]=useState<ChatUi|null>(null);useSpriteInteraction(config,state);
  useEffect(()=>{void initialize();return window.companion.onConfig(()=>{void initialize();});},[initialize]);
  useEffect(()=>{let active=true;void window.companion.getChatUi().then(result=>{if(active&&result.ok)setUi(result.value);});const remove=window.companion.onChatUi(setUi);return()=>{active=false;remove();};},[]);
  useEffect(()=>{const root=ref.current;if(!root)return;const observer=new ResizeObserver(()=>{const bounds=root.getBoundingClientRect(),canvas=root.querySelector('canvas')?.getBoundingClientRect();if(bounds.width&&bounds.height&&canvas)window.companion.resizePet(Math.ceil(bounds.width),Math.ceil(bounds.height),{x:canvas.x-bounds.x,y:canvas.y-bounds.y,width:canvas.width,height:canvas.height});});observer.observe(root);return()=>observer.disconnect();},[]);
  return <div ref={ref} className={styles.pet} data-testid="pet">{error&&<span role="alert">{error}</span>}{ui?.echo&&<StaticBubble {...ui.echo}/>} {config&&assets&&<Sprite assets={assets} config={config.sprite} state={state} onComplete={()=>setState('idle')} fpsCap={config.advanced.fpsCap==='display'?240:Number(config.advanced.fpsCap)}/>}</div>;
}
