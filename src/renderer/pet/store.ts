import { create } from 'zustand';
import type { Config } from '../../shared/config';
import type { SpriteAssets } from '../../shared/sprites';
import type { SpriteState } from '../../shared/enums';
type PetStore={config:Config|null;assets:SpriteAssets|null;state:SpriteState;error:string|null;setState:(state:SpriteState)=>void;initialize:()=>Promise<void>};
export const usePetStore=create<PetStore>((set)=>({config:null,assets:null,state:'idle',error:null,setState:state=>set({state}),initialize:async()=>{const[config,assets]=await Promise.all([window.companion.getConfig(),window.companion.getSpriteAssets()]);if(config.ok&&assets.ok)set({config:config.value,assets:assets.value});else set({error:!assets.ok?assets.error.userMessage:'Settings failed to load.'});}}));
