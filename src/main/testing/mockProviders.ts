import { setTimeout as delay } from 'node:timers/promises';
import type { LLMProvider,ChatDelta,ChatMessage } from '../llm/types';
import type { TTSProvider } from '../tts/types';
import type { STTProvider,STTResult } from '../stt/types';
export const MOCK_FIXTURES={short:'Hello from your companion.',long:'A long reply for scroll testing. '.repeat(130),markdown:'# Hello\n\n**Bold** and *italic*.\n\n- One\n- Two\n\n```ts\nconst greeting = "hello";\n```\n\n[Example](https://example.com)\n\n| A | B |\n|---|---|\n| 1 | 2 |',error:'Partial reply before a failure.',never:'Waiting indefinitely.'};
export class MockLLMProvider implements LLMProvider {
  readonly id='mock';readonly supportsImages=false;
  constructor(private fixture:keyof typeof MOCK_FIXTURES='short',private speed=1000){}
  async *chat(_messages:ChatMessage[],opts:{signal:AbortSignal;model:string}):AsyncIterable<ChatDelta>{for(const text of MOCK_FIXTURES[this.fixture]){await delay(1000/this.speed,undefined,{signal:opts.signal});yield{type:'text',text};}if(this.fixture==='never')await delay(2147483647,undefined,{signal:opts.signal});if(this.fixture==='error')yield{type:'error',message:'Fixture failure'};else yield{type:'done'};}
}
export class MockTTSProvider implements TTSProvider {
  readonly id='mock';readonly requiresApiKey=false;
  async listVoices(){return[{id:'fixture',name:'Silent test voice'}];}
  async *synthesize(text:string,opts:{signal:AbortSignal}):AsyncIterable<Uint8Array>{opts.signal.throwIfAborted();yield new Uint8Array(Math.ceil(text.length*0.02*24000)*2);}
  amplitudeAt(timeMs:number){return (Math.sin(timeMs/100)+1)/2;}
  dispose(){}
}
export class MockSTTProvider implements STTProvider {
  readonly id='mock';readonly requiresApiKey=false;readonly streaming=false;
  async transcribe(_clip:Uint8Array,opts:{signal:AbortSignal}):Promise<STTResult>{opts.signal.throwIfAborted();return{text:'This is a fixture transcript.',isFinal:true,confidence:1};}
  dispose(){}
}
