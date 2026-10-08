import { setTimeout as delay } from 'node:timers/promises';
import type { STTProvider,STTResult } from '../stt/types';
export class MockStreamingSTTProvider implements STTProvider {
  readonly id='mock'; readonly requiresApiKey=false; readonly streaming=true;
  async *transcribeStream(_audio:AsyncIterable<Int16Array>,opts:{signal:AbortSignal}):AsyncIterable<STTResult>{
    for(const text of ['This','This is a','This is a fixture']){await delay(10,undefined,{signal:opts.signal});yield{text,isFinal:false};}
    yield{text:'This is a fixture transcript.',isFinal:true,confidence:1};
  }
  dispose(){}
}
