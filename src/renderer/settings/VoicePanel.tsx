import { useEffect, useState } from 'react';
import type { Config } from '../../shared/config';
import type { SecretStatus } from '../../shared/settings';
import { SETTINGS, matchesSearch } from './definitions';
import { SettingRow } from './SettingRow';
import { SecretInput, flushSecrets } from './SecretInput';
import { flushSettings, useSettingsStore } from './store';
import styles from './Settings.module.css';
export function VoicePanel({config,query}:{config:Config;query:string}) {
  const [voices,setVoices] = useState<{id:string;name:string}[]>([]), [devices,setDevices] = useState<MediaDeviceInfo[]>([]), [status,setStatus] = useState('Idle'), [testing,setTesting] = useState(false), [verified,setVerified] = useState(''), [credentials,setCredentials] = useState<SecretStatus|null>(null);
  const signature = JSON.stringify([config.tts.provider,config.tts.baseUrl,config.tts.model,config.tts.voice,config.tts.format,config.tts.speed,credentials?.revision ?? '']);
  const invalid = useSettingsStore(state=>state.invalid);
  useEffect(() => {
    let active = true; setVoices([]); setStatus('Idle');
    if (config.tts.provider !== 'none' && !['elevenlabs','custom-http'].includes(config.tts.provider)) void window.companion.listVoices().then(result => {if(active) {if(result.ok)setVoices(result.value);else setStatus('Failed: '+result.error.userMessage);}});
    return () => {active=false;};
  },[config.tts.provider,config.tts.baseUrl,credentials?.revision]);
  useEffect(() => {
    if(config.tts.provider==='none') {setDevices([]);return;}
    let active=true;
    const refresh=()=>void navigator.mediaDevices.enumerateDevices().then(value=>{if(active)setDevices(value.filter(device=>device.kind==='audiooutput' && device.deviceId !== 'default'));}).catch(()=>{if(active)setDevices([]);});
    refresh(); navigator.mediaDevices.addEventListener('devicechange',refresh);
    return ()=>{active=false;navigator.mediaDevices.removeEventListener('devicechange',refresh);};
  },[config.tts.provider==='none']);
  const test=async()=>{
    if(testing)return;
    setTesting(true);setStatus('Testing…');
    try {
      await Promise.all([flushSettings(),flushSecrets()]);
      const before=useSettingsStore.getState().config!.tts;
      const secret=before.provider==='openai-compatible-tts' ? await window.companion.getSecretStatus('tts.openai-compatible-tts') : null;
      const tested=JSON.stringify([before.provider,before.baseUrl,before.model,before.voice,before.format,before.speed,secret?.ok ? secret.value.revision : '']);
      const result=await window.companion.testVoice();
      if(result.ok){setVerified(tested);setStatus(`Played test phrase — first audio in ${Math.round(result.value.firstAudioMs)} ms.`);}
      else{setVerified('');setStatus('Failed: '+result.error.userMessage);}
    }catch{setVerified('');setStatus('Failed: The voice test could not be completed.');}
    finally{setTesting(false);}
  };
  const rows=SETTINGS.filter(row=>row.panel==='Voice' && (!row.visible || row.visible(config)) && matchesSearch(row.label+' '+(row.synonyms??''),query));
  const groups=[...new Set(rows.map(row=>row.group))];
  const http=config.tts.provider==='openai-compatible-tts';
  if(http && matchesSearch('API key authentication password Test Connection',query) && !groups.includes('OpenAI-compatible endpoint')) groups.splice(1,0,'OpenAI-compatible endpoint');
  if(config.tts.provider!=='none' && matchesSearch('Test Voice',query) && !groups.includes('Playback'))groups.push('Playback');
  const voiceChoices: readonly (readonly [string,string])[] = [[config.tts.voice==='alloy'?'alloy':'','System default voice'],...voices.map(voice=>[voice.id,voice.name] as const),...(!['','alloy',...voices.map(voice=>voice.id)].includes(config.tts.voice)?[[config.tts.voice,'Unavailable voice'] as const]:[])];
  const deviceChoices: readonly (readonly [string,string])[] = [['default','System default'],...devices.map((device,index)=>[device.deviceId,device.label||`Output ${index+1}`] as const),...(config.tts.outputDeviceId!=='default' && !devices.some(device=>device.deviceId===config.tts.outputDeviceId)?[[config.tts.outputDeviceId,'Unavailable output device'] as const]:[])];
  const renderRow=(row:typeof rows[number])=><SettingRow key={row.id} definition={row} config={config} verified={verified===signature} choices={row.id===84?voiceChoices:row.id===106?deviceChoices:undefined} models={row.id===88?['tts-1','tts-1-hd','kokoro']:row.id===89?(voices.length?voices.map(voice=>voice.id):['alloy','af_bella']):undefined}/>;
  return <>
    {groups.map(group=><section className={styles.section} key={group}><h2>{group}</h2><div className={styles.group}>
      {rows.filter(row=>row.group===group && row.id!==88 && row.id!==89 && row.id!==90).map(renderRow)}
      {group==='OpenAI-compatible endpoint' && <>
        {matchesSearch('API key authentication password',query) && <SecretInput key="tts.openai-compatible-tts" id="tts.openai-compatible-tts" controlId={87} local={true} verified={verified===signature} onStatus={setCredentials}/>}
        {rows.filter(row=>row.group===group && [88,89,90].includes(row.id)).map(renderRow)}
        {matchesSearch('Test Connection',query) && <div className={styles.row}><button className={styles.button} disabled={testing||Boolean(invalid['tts.baseUrl'])||Boolean(invalid['secret.tts.openai-compatible-tts'])} onClick={()=>void test()}>Test Connection</button><span className={styles.hint}>Tests synthesis and playback with the current provider.</span></div>}
      </>}
      {group==='Playback' && matchesSearch('Test Voice',query) && <div className={styles.row} data-control={111}><button className={styles.button} disabled={testing||Boolean(invalid['tts.baseUrl'])||Boolean(invalid['secret.tts.openai-compatible-tts'])} onClick={()=>void test()}>Test Voice</button></div>}
    </div></section>)}
    {config.tts.provider==='none' && <p className={styles.hint}>The companion will respond in text only. The speaking animation will follow the text as it streams in.</p>}
    {config.tts.provider!=='none' && <p role="status" aria-label="Voice test" className={status.startsWith('Failed')?styles.error:styles.hint}>{status}</p>}
    {['elevenlabs','custom-http'].includes(config.tts.provider) && <p className={styles.hint}>This provider is planned for the next build phase.</p>}
  </>;
}
