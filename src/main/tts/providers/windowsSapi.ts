import type { Config } from '../../../shared/config';
import type { TTSProvider } from '../types';
import { windowsSpeech, windowsVoiceSchema } from '../../platform/win32/speech';
export class WindowsSapiProvider implements TTSProvider {
  id = 'windows-sapi';
  requiresApiKey = false;
  constructor(private config: Config['tts']) {}
  async listVoices() {
    return windowsVoiceSchema.parse(
      JSON.parse(await windowsSpeech({ action: 'voices' }, AbortSignal.timeout(15000))),
    );
  }
  async *synthesize(text: string, opts: Parameters<TTSProvider['synthesize']>[1]) {
    const data = await windowsSpeech(
      { action: 'speak', text, voice: opts.voice, speed: opts.speed, pitch: this.config.pitch },
      opts.signal,
    );
    opts.signal.throwIfAborted();
    const bytes = Buffer.from(data, 'base64');
    if (
      bytes.length < 44 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    )
      throw new Error('Windows returned invalid audio.');
    yield bytes;
  }
  dispose() {}
}
