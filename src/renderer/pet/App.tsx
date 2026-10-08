import { useEffect } from 'react';
import { usePetStore } from './store';
import { Sprite } from './Sprite';
export function PetApp(){const {config,assets,state,error,initialize}=usePetStore();useEffect(()=>{void initialize();return window.companion.onConfig(()=>{void initialize();});},[initialize]);return <div data-testid="pet">{error&&<span role="alert">{error}</span>}{config&&assets&&<Sprite assets={assets} config={config.sprite} state={state}/>}</div>;}
