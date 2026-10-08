import { app,dialog,protocol,net } from 'electron';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { ConfigStore } from './services/configStore';
import { openSettings } from './windows/settingsWindow';
import { createPetWindow } from './windows/petWindow';
import { registerHandlers } from './ipc/handlers';
import { SpriteLoader } from './services/spriteLoader';
protocol.registerSchemesAsPrivileged([{scheme:'companion',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const testData=process.env.LITTLELLM_TEST_USER_DATA;if(testData)app.setPath('userData',testData);
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>openSettings('General'));
  void app.whenReady().then(async()=>{
    mkdirSync(app.getPath('userData'),{recursive:true});
    let config:ConfigStore;try{config=new ConfigStore(app.getPath('userData'));}catch{dialog.showErrorBox('Settings cannot be loaded','This settings file was created by a newer version of the app.');app.quit();return;}
    const sprites=new SpriteLoader(app.getPath('userData'));await sprites.initialize();
    protocol.handle('companion',async request=>{try{const response=await net.fetch(pathToFileURL(await sprites.protocolPath(new URL(request.url))).href);const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');return new Response(response.body,{status:response.status,headers});}catch{return new Response(null,{status:404});}});
    registerHandlers(config,openSettings,sprites);
    await createPetWindow(config,openSettings);
    if(config.backupPath&&!testData)await dialog.showMessageBox({type:'warning',message:'Some settings were invalid and have been restored.',detail:`Backup: ${config.backupPath}`});
  });
  app.on('window-all-closed',()=>app.quit());
}
