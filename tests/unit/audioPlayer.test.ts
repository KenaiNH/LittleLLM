import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defaults } from '../../src/shared/config';
import { AudioPlayer } from '../../src/renderer/audio/AudioPlayer';
class BufferFixture {
  readonly data: Float32Array;
  duration: number;
  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
    this.duration = length / sampleRate;
  }
  getChannelData() {
    return this.data;
  }
}
class SourceFixture {
  buffer: BufferFixture | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  stop = vi.fn();
  start = vi.fn();
}
class ContextFixture {
  static instances: ContextFixture[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  sources: SourceFixture[] = [];
  gain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  analyser = { fftSize: 0, connect: vi.fn() };
  setSinkId = vi.fn(async () => undefined);
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async () => new BufferFixture(2400, 24000));
  constructor() {
    ContextFixture.instances.push(this);
  }
  createGain() {
    return this.gain;
  }
  createAnalyser() {
    return this.analyser;
  }
  createBuffer(_channels: number, length: number, rate: number) {
    return new BufferFixture(length, rate);
  }
  createBufferSource() {
    const source = new SourceFixture();
    this.sources.push(source);
    return source;
  }
}
async function settle() {
  for (let n = 0; n < 40; n++) await Promise.resolve();
}
function fixture() {
  ContextFixture.instances = [];
  vi.stubGlobal('AudioContext', ContextFixture);
  const feedback = vi.fn(),
    cfg = { ...defaults().tts, provider: 'openai-compatible-tts' as const };
  return { player: new AudioPlayer(cfg, feedback), feedback, cfg, id: randomUUID() };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('voice Off never constructs a graph and closes an enabled graph when disabled', async () => {
  const { player, cfg, id } = fixture();
  player.configure({ ...cfg, provider: 'none' });
  player.receive({ type: 'start', requestId: id, segment: 0, format: 'pcm16' });
  await settle();
  expect(ContextFixture.instances).toHaveLength(0);
  player.configure(cfg);
  player.receive({ type: 'start', requestId: id, segment: 1, format: 'pcm16' });
  await settle();
  expect(ContextFixture.instances).toHaveLength(1);
  player.configure({ ...cfg, provider: 'none' });
  await settle();
  expect(ContextFixture.instances[0]?.close).toHaveBeenCalledTimes(1);
});
it('decodes signed little-endian PCM across odd packet boundaries and schedules without gaps', async () => {
  vi.useFakeTimers();
  const { player, feedback, id } = fixture();
  player.receive({ type: 'start', requestId: id, segment: 0, format: 'pcm16' });
  player.receive({
    type: 'data',
    requestId: id,
    segment: 0,
    data: Buffer.from([0xff]).toString('base64'),
  });
  player.receive({
    type: 'data',
    requestId: id,
    segment: 0,
    data: Buffer.from([0x7f, 0, 0x80]).toString('base64'),
  });
  player.receive({
    type: 'data',
    requestId: id,
    segment: 0,
    data: Buffer.from([0, 0]).toString('base64'),
  });
  player.receive({ type: 'end', requestId: id, segment: 0 });
  await settle();
  const context = ContextFixture.instances[0];
  if (!context) throw new Error('context');
  expect([...(context.sources[0]?.buffer?.data ?? [])]).toEqual([32767 / 32768, -1]);
  expect(context.sources[0]?.start).toHaveBeenCalledWith(0.015);
  expect(context.sources[1]?.start).toHaveBeenCalledWith(0.015 + 2 / 24000);
  expect(context.gain.connect).toHaveBeenCalledWith(context.analyser);
  expect(context.analyser.connect).toHaveBeenCalledWith(context.destination);
  await vi.advanceTimersByTimeAsync(20);
  expect(feedback).toHaveBeenCalledWith({ requestId: id, segment: 0, status: 'started' });
  context.sources[0]?.onended?.();
  expect(feedback).not.toHaveBeenCalledWith({ requestId: id, segment: 0, status: 'ended' });
  context.sources[1]?.onended?.();
  expect(feedback).toHaveBeenCalledWith({ requestId: id, segment: 0, status: 'ended' });
  await player.dispose();
});
it('cancellation prevents pending compressed decode from starting late audio', async () => {
  const { player, id } = fixture();
  player.receive({ type: 'start', requestId: id, segment: 0, format: 'wav' });
  await settle();
  const context = ContextFixture.instances[0];
  if (!context) throw new Error('context');
  let release: (buffer: BufferFixture) => void = () => undefined;
  context.decodeAudioData.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  player.receive({
    type: 'data',
    requestId: id,
    segment: 0,
    data: Buffer.from([1, 2]).toString('base64'),
  });
  player.receive({ type: 'end', requestId: id, segment: 0 });
  await settle();
  player.receive({ type: 'stop', requestId: id });
  release(new BufferFixture(2400, 24000));
  await settle();
  expect(context.sources).toHaveLength(0);
  await player.dispose();
});
it('finish-sentence removes future audio and mute applies independently of synthesis', async () => {
  const { player, cfg, id } = fixture();
  for (const segment of [0, 1]) {
    player.receive({ type: 'start', requestId: id, segment, format: 'pcm16' });
    player.receive({
      type: 'data',
      requestId: id,
      segment,
      data: Buffer.from([1, 2]).toString('base64'),
    });
    player.receive({ type: 'end', requestId: id, segment });
  }
  await settle();
  const context = ContextFixture.instances[0];
  if (!context) throw new Error('context');
  player.receive({ type: 'finish', requestId: id, segment: 0 });
  expect(context.sources[0]?.stop).not.toHaveBeenCalled();
  expect(context.sources[1]?.stop).toHaveBeenCalledTimes(1);
  player.configure({ ...cfg, muted: true });
  expect(context.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.01);
  await player.dispose();
});
