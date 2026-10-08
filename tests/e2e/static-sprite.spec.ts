import { test,expect,_electron } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
test('draws transparent default sprite and applies scale',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'littlellm-sprite-'));const app=await _electron.launch({args:['out/main/index.js'],env:launchEnvironment(directory)});
  try{const window=await app.firstWindow();window.on('console',message=>console.log(message.text()));window.on('pageerror',error=>console.log(error.message));await expect(window.getByTestId('sprite')).toBeAttached();await expect.poll(()=>window.getByTestId('sprite').evaluate(node=>{const canvas=node as HTMLCanvasElement;return canvas.getContext('2d')?.getImageData(64,65,1,1).data[3];})).toBe(255);
    const result=await window.evaluate(async()=>{const result=await globalThis.window.companion.getConfig();if(!result.ok)throw new Error('Settings error');return globalThis.window.companion.setConfig('sprite',{...result.value.sprite,scale:1.5});});expect(result.ok).toBe(true);
    await expect.poll(()=>window.getByTestId('sprite').evaluate(node=>(node as HTMLCanvasElement).getBoundingClientRect().width)).toBe(192);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.getSize())).toEqual([192,192]);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
