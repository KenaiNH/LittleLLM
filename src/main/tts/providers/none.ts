import type { TTSProvider } from '../types';
export class NoneTTSProvider implements TTSProvider {
  id = 'none';
  requiresApiKey = false;
  async listVoices() {
    return [];
  }
  async *synthesize(): AsyncIterable<Uint8Array> {
    /* No audio allocation. */
  }
  dispose() {}
}
