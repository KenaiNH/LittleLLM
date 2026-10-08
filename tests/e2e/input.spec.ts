import { test,expect,_electron } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchEnvironment } from './environment';
// Playwright requires a destructured fixture argument to provide TestInfo.
// eslint-disable-next-line no-empty-pattern
test('sprite opens full-width input, submits an echo and remembers drafts',async({},info)=>{
  const directory=await mkdtemp(join(tmpdir(),'littlellm-input-'));const app=await _electron.launch({args:['out/main/index.js'],env:launchEnvironment(directory)});
  try{
    const pet=await app.firstWindow();await pet.getByTestId('sprite').waitFor();
    const opened=app.waitForEvent('window');await pet.getByTestId('sprite').click({position:{x:64,y:65}});const input=await opened;const response=input.getByRole('textbox',{name:'Your response'});await expect(response).toBeFocused();
    expect(await app.evaluate(({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=input'));if(!win)throw new Error('Missing input');return win.getBounds().width===screen.getDisplayMatching(win.getBounds()).workArea.width;})).toBe(true);
    await expect(input.getByRole('button',{name:'Voice input'})).toHaveCount(0);
    await input.screenshot({path:info.outputPath('input.png')});
    await response.fill('First line');await response.press('Shift+Enter');await response.press('End');await response.press('b');await response.press('Enter');
    await expect(pet.getByTestId('bubble')).toContainText('First line\nb');
    await pet.screenshot({path:info.outputPath('bubble.png')});
    await expect.poll(()=>app.evaluate(async({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'));if(!win)throw new Error('Missing pet');const bounds=win.getBounds(),display=screen.getDisplayMatching(bounds);return win.webContents.executeJavaScript(`window.companion.getConfig().then(result=>result.ok && result.value.window.positions['${display.id}']?.x === ${bounds.x+bounds.width-128})`) as Promise<boolean>;})).toBe(true);
    await expect.poll(()=>pet.evaluate(async()=>{const result=await window.companion.getChatUi();return result.ok?result.value.inputOpen:null;})).toBe(false);
    await pet.getByTestId('sprite').click({position:{x:64,y:65}});await expect(response).toBeFocused();await response.fill('Saved draft');await response.press('Escape');
    await pet.getByTestId('sprite').click({position:{x:64,y:65}});await expect(response).toHaveValue('Saved draft');
    await input.evaluate(async()=>{const cfg=await window.companion.getConfig();if(cfg.ok)await window.companion.setConfig('input',{...cfg.value.input,sendWith:'ctrl-enter'});});
    await response.press('Enter');await expect(response).toHaveValue('Saved draft\n');await response.press('Control+Enter');await expect(pet.getByTestId('bubble')).toContainText('Saved draft');
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
