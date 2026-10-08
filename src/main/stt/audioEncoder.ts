export function encodeWav(pcm: Uint8Array, sampleRate = 16000): Uint8Array {
  if (pcm.length % 2 || pcm.length > 32 * 1024 * 1024) throw new Error('Invalid recording size.');
  const bytes = Buffer.alloc(44 + pcm.length);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + pcm.length, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(pcm.length, 40);
  bytes.set(pcm, 44);
  return bytes;
}
