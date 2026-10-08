import { _electron } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const directory=await mkdtemp(join(tmpdir(),'littlellm-perf-'));
const env={...process.env,LITTLELLM_TEST_USER_DATA:directory};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({args:['out/main/index.js'],env});
try {
  const page=await app.firstWindow();await page.getByTestId('sprite').waitFor();
  await new Promise(resolve=>setTimeout(resolve,2000));
  const values=[];
  for(let i=0;i<5;i++){const metrics=await app.evaluate(({app})=>app.getAppMetrics().map(m=>({type:m.type,cpu:m.cpu.percentCPUUsage,memoryKb:m.memory.workingSetSize})));values.push({cpu:metrics.reduce((n,m)=>n+m.cpu,0),memoryMb:metrics.reduce((n,m)=>n+m.memoryKb,0)/1024});await new Promise(resolve=>setTimeout(resolve,500));}
  console.log(JSON.stringify({cpuPercentAverage:values.slice(1).reduce((n,m)=>n+m.cpu,0)/4,memoryMb:values.at(-1)?.memoryMb}));
} finally {await app.close();await rm(directory,{recursive:true,force:true});}
