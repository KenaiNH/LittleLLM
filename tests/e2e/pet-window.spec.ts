import { test,expect,_electron } from '@playwright/test';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
test('pet window stays on top and persists position',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'littlellm-placement-'));
  const environment=launchEnvironment(directory);
  let application=await _electron.launch({args:['out/main/index.js'],env:environment});
  try{
    const window=await application.firstWindow();await expect(window.getByTestId('pet')).toBeAttached();
    expect(await application.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];return {onTop:win?.isAlwaysOnTop(),resizable:win?.isResizable()};})).toEqual({onTop:true,resizable:false});
    const position=await application.evaluate(({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows()[0];if(!win)throw new Error('No window');const area=screen.getPrimaryDisplay().workArea;win.setPosition(area.x+100,area.y+100);return{x:area.x+100,y:area.y+100};});
    await expect.poll(async()=>{const cfg=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));return Object.values(cfg.window.positions).some(p=>JSON.stringify(p)===JSON.stringify(position));}).toBe(true);
    await application.close();application=await _electron.launch({args:['out/main/index.js'],env:environment});
    await application.firstWindow();expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.getPosition())).toEqual([position.x,position.y]);
  }finally{await application.close();await rm(directory,{recursive:true,force:true});}
});
