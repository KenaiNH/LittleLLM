import type { Config } from '../../shared/config';
import type { TTSPacket, TTSFeedback } from '../../shared/tts';
type OutputContext = AudioContext & { setSinkId(id: string): Promise<void> };
type Segment = {
  index: number;
  format: string;
  parts: Uint8Array[];
  bytes: number;
  carry: number | null;
  ended: boolean;
  sources: number;
  started: boolean;
  samples: number;
};
type Scheduled = {
  source: AudioBufferSourceNode;
  segment: Segment;
  timer: ReturnType<typeof setTimeout>;
};
export class AudioPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private id: string | null = null;
  private epoch = 0;
  private nextAt = 0;
  private queue = Promise.resolve();
  private segments = new Map<number, Segment>();
  private sources = new Set<Scheduled>();
  private finishAt: number | null = null;
  private cfg: Config['tts'];
  constructor(
    config: Config['tts'],
    private feedback: (event: TTSFeedback) => void,
  ) {
    this.cfg = config;
  }
  configure(config: Config['tts']) {
    const old = this.cfg;
    this.cfg = config;
    if (config.provider === 'none') {
      void this.dispose();
      return;
    }
    if (this.context && this.gain)
      this.gain.gain.setTargetAtTime(
        config.muted ? 0 : config.volume,
        this.context.currentTime,
        0.01,
      );
    if (old.outputDeviceId !== config.outputDeviceId && this.context)
      void this.route(this.context).catch(() => undefined);
  }
  private async route(context: AudioContext) {
    try {
      await (context as OutputContext).setSinkId(
        this.cfg.outputDeviceId === 'default' ? '' : this.cfg.outputDeviceId,
      );
    } catch {
      await (context as OutputContext).setSinkId('');
      // Device selection is independent of synthesis. Keep the default device usable.
      if (this.id)
        this.feedback({
          requestId: this.id,
          segment: [...this.segments.keys()][0] ?? 0,
          status: 'warning',
          message: 'The selected output is unavailable. Using the system default.',
        });
    }
  }
  private async initialize() {
    if (this.cfg.provider === 'none') throw new Error('Voice is off.');
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.gain = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.gain.gain.value = this.cfg.muted ? 0 : this.cfg.volume;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      await this.route(this.context);
    }
    await this.context.resume();
    return this.context;
  }
  receive(event: TTSPacket) {
    if (event.type === 'stop') {
      if (event.requestId === this.id) this.stop();
      return;
    }
    if (event.type === 'finish') {
      if (event.requestId !== this.id) return;
      this.finishAt = event.segment;
      for (const entry of this.sources)
        if (entry.segment.index !== event.segment) this.cancelSource(entry);
      for (const index of this.segments.keys())
        if (index !== event.segment) this.segments.delete(index);
      return;
    }
    if (event.type === 'start' && event.requestId !== this.id) {
      this.stop();
      this.id = event.requestId;
    }
    if (event.requestId !== this.id || (this.finishAt !== null && event.segment !== this.finishAt))
      return;
    const epoch = this.epoch;
    this.queue = this.queue
      .then(async () => {
        if (epoch !== this.epoch || (this.finishAt !== null && event.segment !== this.finishAt))
          return;
        if (event.type === 'start') {
          this.segments.set(event.segment, {
            index: event.segment,
            format: event.format,
            parts: [],
            bytes: 0,
            carry: null,
            ended: false,
            sources: 0,
            started: false,
            samples: 0,
          });
          await this.initialize();
          return;
        }
        const segment = this.segments.get(event.segment);
        if (!segment || (this.finishAt !== null && event.segment !== this.finishAt)) return;
        const context = this.context;
        if (!context) throw new Error('Audio output is unavailable.');
        if (event.type === 'data') {
          const raw = atob(event.data),
            bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
          segment.bytes += bytes.length;
          if (segment.bytes > 32 * 1024 * 1024)
            throw new Error('Audio exceeds the playback budget.');
          if (segment.format !== 'pcm16') segment.parts.push(bytes);
          else {
            const pcm = segment.carry === null ? bytes : Uint8Array.from([segment.carry, ...bytes]);
            segment.carry = pcm.length % 2 ? (pcm[pcm.length - 1] ?? null) : null;
            const length = Math.floor(pcm.length / 2);
            if (length) {
              const buffer = context.createBuffer(1, length, 24000),
                output = buffer.getChannelData(0),
                view = new DataView(pcm.buffer, pcm.byteOffset, length * 2);
              for (let at = 0; at < length; at++) output[at] = view.getInt16(at * 2, true) / 32768;
              this.schedule(segment, buffer, epoch);
            }
          }
        } else {
          if (segment.format !== 'pcm16') {
            const bytes = new Uint8Array(segment.bytes);
            let at = 0;
            for (const part of segment.parts) {
              bytes.set(part, at);
              at += part.length;
            }
            segment.parts = [];
            const buffer = await context.decodeAudioData(bytes.buffer);
            if (epoch !== this.epoch || (this.finishAt !== null && event.segment !== this.finishAt))
              return;
            this.schedule(segment, buffer, epoch);
          }
          if (segment.carry !== null || !segment.samples)
            throw new Error('Incomplete audio stream.');
          segment.ended = true;
          this.ended(segment);
        }
      })
      .catch(() => {
        if (epoch !== this.epoch || !this.id) return;
        const requestId = this.id;
        this.stop();
        this.feedback({ requestId, segment: event.segment, status: 'error' });
      });
  }
  private schedule(segment: Segment, buffer: AudioBuffer, epoch: number) {
    const context = this.context,
      gain = this.gain;
    if (!context || !gain) throw new Error('Audio output is unavailable.');
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const at = Math.max(context.currentTime + 0.015, this.nextAt);
    this.nextAt = at + buffer.duration;
    segment.samples += buffer.length;
    segment.sources++;
    const entry: Scheduled = {
      source,
      segment,
      timer: setTimeout(
        () => {
          if (epoch !== this.epoch || !this.id || segment.started) return;
          segment.started = true;
          this.feedback({ requestId: this.id, segment: segment.index, status: 'started' });
        },
        Math.max(0, (at - context.currentTime) * 1000),
      ),
    };
    source.onended = () => {
      clearTimeout(entry.timer);
      source.disconnect();
      this.sources.delete(entry);
      if (epoch !== this.epoch) return;
      segment.sources--;
      this.ended(segment);
    };
    this.sources.add(entry);
    source.start(at);
  }
  private ended(segment: Segment) {
    if (!this.id || !segment.ended || segment.sources) return;
    this.segments.delete(segment.index);
    this.feedback({ requestId: this.id, segment: segment.index, status: 'ended' });
  }
  private cancelSource(entry: Scheduled) {
    clearTimeout(entry.timer);
    entry.source.onended = null;
    entry.source.stop();
    entry.source.disconnect();
    this.sources.delete(entry);
  }
  stop() {
    this.epoch++;
    this.id = null;
    this.finishAt = null;
    for (const entry of this.sources) this.cancelSource(entry);
    this.segments.clear();
    this.nextAt = 0;
  }
  async dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.gain = null;
    this.analyser = null;
    if (context && context.state !== 'closed') await context.close();
  }
}
