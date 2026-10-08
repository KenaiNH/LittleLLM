export const CHANNELS={
  configGet:'config:get',configSet:'config:set',configReset:'config:reset',configChanged:'config:changed',
  secretSet:'secret:set',secretHas:'secret:has',secretClear:'secret:clear',
  llmChat:'llm:chat',llmAbort:'llm:abort',llmTest:'llm:test',llmModels:'llm:models',llmDelta:'llm:delta',
  ttsSynthesize:'tts:synthesize',ttsAbort:'tts:abort',ttsVoices:'tts:voices',ttsTest:'tts:test',ttsAudio:'tts:audio',
  sttStart:'stt:start',sttStop:'stt:stop',sttAbort:'stt:abort',sttAudioFrame:'stt:audio-frame',sttResult:'stt:result',
  spriteImport:'sprite:import',spriteValidate:'sprite:validate',spriteMask:'sprite:mask',spriteAssets:'sprite:assets',spriteReset:'sprite:reset',packImport:'pack:import',packExport:'pack:export',
  attachClipboard:'attach:clipboard',attachFile:'attach:file',attachRegion:'attach:region',
  windowMove:'window:move',windowIgnoreMouse:'window:set-ignore-mouse',windowResize:'window:resize',windowSettings:'window:settings',windowVisibility:'window:visibility',windowDpi:'window:dpi',
  stateChanged:'state:changed',toastShow:'toast:show',shellOpenExternal:'shell:open-external',shellOpenPath:'shell:open-path',
} as const;
