import { app,BrowserWindow,dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { ConfigStore } from './services/configStore';
import { openSettings } from './windows/settingsWindow';
import { preloadPath,secureWindow,loadRenderer } from './windows/security';
import { registerHandlers } from './ipc/handlers';
const testData=process.env.LITTLELLM_TEST_USER_DATA;if(testData)app.setPath('userData',testData);
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>openSettings('General'));
  void app.whenReady().then(async()=>{
    mkdirSync(app.getPath('userData'),{recursive:true});
    let config:ConfigStore;try{config=new ConfigStore(app.getPath('userData'));}catch{dialog.showErrorBox('Settings cannot be loaded','This settings file was created by a newer version of the app.');app.quit();return;}
    registerHandlers(config,openSettings);
    const win=new BrowserWindow({width:320,height:320,show:false,webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    secureWindow(win);win.once('ready-to-show',()=>win.showInactive());await loadRenderer(win,'scaffold');
    if(config.backupPath&&!testData)await dialog.showMessageBox({type:'warning',message:'Some settings were invalid and have been restored.',detail:`Backup: ${config.backupPath}`});
  });
  app.on('window-all-closed',()=>app.quit());
}
