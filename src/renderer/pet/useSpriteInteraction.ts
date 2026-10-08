import { useEffect } from 'react';
import type { Config } from '../../shared/config';
import type { SpriteState } from '../../shared/enums';
import { alphaHit,sourcePixel,type AlphaMask } from '../../shared/hitTest';
export function useSpriteInteraction(config:Config|null,state:SpriteState){
  useEffect(()=>{if(!config)return;const controller=new AbortController();const masks:Partial<Record<SpriteState,AlphaMask>>={};void window.companion.getSpriteMasks().then(result=>{if(controller.signal.aborted||!result.ok)return;for(const[key,mask]of Object.entries(result.value)){if(!mask)continue;const data=atob(mask.alphaBase64);masks[key as SpriteState]={width:mask.width,height:mask.height,alpha:Uint8Array.from(data,c=>c.charCodeAt(0))};}});
    let frame=0,ignore=false,last=false,drag:null|{screenX:number;screenY:number;x:number;y:number}=null,moved=false;
    const move=(event:MouseEvent)=>{
      if(drag){if(Math.hypot(event.screenX-drag.screenX,event.screenY-drag.screenY)>4)moved=true;if(moved)window.companion.movePet(drag.x+event.screenX-drag.screenX,drag.y+event.screenY-drag.screenY);return;}
      const canvas=document.querySelector('canvas[data-testid="sprite"]');const bounds=canvas?.getBoundingClientRect();if(!bounds)return;
      const selected=state==='listening'?config.sprite.listeningBehavior==='use-thinking'?'thinking':config.sprite.listeningBehavior==='custom'?'listening':'idle':state;const mask=masks[selected]??masks.idle;
      const interactive=event.target instanceof Element?event.target.closest('button,input,textarea,select,[data-interactive]'):null;const inside=event.clientX>=bounds.x&&event.clientX<bounds.right&&event.clientY>=bounds.y&&event.clientY<bounds.bottom;
      const hit=config.advanced.clickThrough==='never'||Boolean(interactive)||(inside&&(config.advanced.clickThrough==='bounding-box'||!mask||alphaHit(mask,sourcePixel({cursorDip:{x:event.screenX,y:event.screenY},windowDip:{x:window.screenX,y:window.screenY},canvasCss:{x:bounds.x,y:bounds.y},scale:config.sprite.scale,dpi:window.devicePixelRatio,scaleMode:config.sprite.scaleMode,flip:config.sprite.flipHorizontal,width:mask.width,height:mask.height}),config.advanced.alphaThreshold)));
      ignore=!hit;if(!frame){let samples=0;const apply=()=>{if(++samples<config.advanced.hitTestEveryNFrames){frame=requestAnimationFrame(apply);return;}frame=0;if(last!==ignore){last=ignore;window.companion.setIgnoreMouse(ignore);}};frame=requestAnimationFrame(apply);}
    };
    const down=(event:MouseEvent)=>{const modifier=config.advanced.dragModifier;if(event.button!==0||!config.advanced.dragEnabled||(modifier==='alt'&&!event.altKey)||(modifier==='ctrl'&&!event.ctrlKey)||(modifier==='shift'&&!event.shiftKey)||!(event.target instanceof HTMLCanvasElement))return;drag={screenX:event.screenX,screenY:event.screenY,x:window.screenX,y:window.screenY};moved=false;window.companion.setIgnoreMouse(false);};
    const up=(event:MouseEvent)=>{drag=null;if(moved){event.preventDefault();event.stopPropagation();}moved=false;};
    document.addEventListener('mousemove',move);document.addEventListener('mousedown',down);document.addEventListener('mouseup',up,true);
    return()=>{controller.abort();cancelAnimationFrame(frame);document.removeEventListener('mousemove',move);document.removeEventListener('mousedown',down);document.removeEventListener('mouseup',up,true);window.companion.setIgnoreMouse(false);};
  },[config,state]);
}
