import { test,expect,_electron } from '@playwright/test';
import { mkdtemp,rm,writeFile,readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
test('secure renderer and corrupt config recovery',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'littlellm-smoke-'));
  await writeFile(join(directory,'config.json'),'{broken');
  const environment=launchEnvironment(directory);
  const application=await _electron.launch({args:['out/main/index.js'],env:environment});
  try{const window=await application.firstWindow();await expect(window.getByTestId('scaffold')).toBeAttached();expect(await window.evaluate(()=>typeof (globalThis as {require?:unknown}).require)).toBe('undefined');expect((await readdir(directory)).some(name=>name.startsWith('config.corrupt.'))).toBe(true);expect(JSON.parse(await readFile(join(directory,'config.json'),'utf8')).schemaVersion).toBe(1);}
  finally{await application.close();await rm(directory,{recursive:true,force:true});}
});
