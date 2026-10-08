import { describe,it,expect } from 'vitest';
import { defaults,configSchema,configSections,sessionStateSchema } from '../../src/shared/config';
import { recoverConfig,FutureConfigError } from '../../src/main/services/configRecovery';
import { MockLLMProvider,MockTTSProvider,MockSTTProvider } from '../../src/main/testing/mockProviders';
describe('config recovery',()=>{
  it('round trips the full tree',()=>{const cfg=defaults();expect(configSchema.parse(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg);expect(cfg.tts.provider).toBe('none');expect(cfg.stt.provider).toBe('none');expect(cfg.window.defaultAnchor).toBe('br');});
  it('rejects future versions without replacing them',()=>expect(()=>recoverConfig({schemaVersion:2})).toThrow(FutureConfigError));
  it('migrates unversioned files and retains valid sections',()=>{const result=recoverConfig({window:{edgeMarginPx:32},bubble:{scale:10}});expect(result.config.window.edgeMarginPx).toBe(32);expect(result.config.bubble.scale).toBe(1);expect(result.recovered).toEqual(['bubble']);});
  it('recovers every invalid section independently',()=>{for(const key of Object.keys(configSections)){const cfg=defaults();const result=recoverConfig({...cfg,[key]:null});expect(result.recovered).toEqual([key]);expect(result.config).toEqual(cfg);}});
  it('does not persist temporary debugging flags',()=>{expect('forceState' in defaults().advanced).toBe(false);expect(sessionStateSchema.parse({}).forceState).toBe('auto');});
});
describe('offline mocks',()=>{
  it('streams text and a terminal event',async()=>{const events=await Array.fromAsync(new MockLLMProvider('short',100000).chat([],{signal:new AbortController().signal,model:'fixture'}));expect(events.at(-1)?.type).toBe('done');});
  it('emits a failure terminal',async()=>{const events=await Array.fromAsync(new MockLLMProvider('error',100000).chat([],{signal:new AbortController().signal,model:'fixture'}));expect(events.at(-1)?.type).toBe('error');});
  it('aborts never-ending generation',async()=>{const controller=new AbortController();const stream=new MockLLMProvider('never',100000).chat([],{signal:controller.signal,model:'fixture'});await stream[Symbol.asyncIterator]().next();controller.abort();await expect(Array.fromAsync(stream)).rejects.toThrow();});
  it('uses no audio hardware',async()=>{const signal=new AbortController().signal;const tts=new MockTTSProvider();const chunks=await Array.fromAsync(tts.synthesize('Hello',{signal}));expect(chunks[0]?.some(v=>v!==0)).toBe(false);expect(tts.amplitudeAt(50)).toBeGreaterThan(0);expect((await new MockSTTProvider().transcribe(new Uint8Array(),{signal})).isFinal).toBe(true);});
});
