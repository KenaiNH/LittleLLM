import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Config } from '../../shared/config';
import {
  sttUiSchema,
  type SttUi,
  type SttCapture,
  type SttFeedback,
  type SttFrame,
} from '../../shared/stt';
import { createSTTProvider } from './registry';
import type { STTProvider } from './types';
import { encodeWav } from './audioEncoder';
import { VoiceDetection } from './vad';
import { processTranscript } from './transcript';
import mockTranscript from '../../../assets/speech/mock-transcript.json';
type Session = {
  id: string;
  config: Config['stt'];
  preview: boolean;
  test: boolean;
  stopping: boolean;
  released: boolean;
  index: number;
  size: number;
  chunks: Uint8Array[];
  controller: AbortController;
  provider: STTProvider | null;
  vad: VoiceDetection;
};
export class SttSession {
  private active: Session | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  private countdown: ReturnType<typeof setTimeout> | undefined;
  private recent: string[] = [];
  private epoch = 0;
  private releasing = new Map<string, ReturnType<typeof setTimeout>>();
  readonly devices: { id: string; label: string }[] = [];
  ui: SttUi = sttUiSchema.parse({});
  constructor(
    private config: () => Config,
    private key: (provider: Config['stt']['provider']) => Promise<string | undefined>,
    private capture: (packet: SttCapture) => void,
    private publish: (ui: SttUi) => void,
    private lifecycle: (phase: 'listening' | 'transcribing' | 'idle') => void,
    private insert: (text: string, cfg: Config['stt']) => Promise<void>,
    private submit: () => Promise<void>,
    private releaseFailure: () => void,
  ) {}
  get canCapture() {
    return Boolean(
      this.active &&
      !this.active.stopping &&
      ['starting', 'preview', 'recording'].includes(this.ui.status),
    );
  }
  get isPreview() {
    return this.active?.preview ?? false;
  }
  get isTest() {
    return this.active?.test ?? false;
  }
  renewPreview() {
    if (this.active?.preview) {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => this.abort(), 45000);
      this.capture({ type: 'heartbeat', sessionId: this.active.id });
    }
  }
  private update(patch: Partial<SttUi>) {
    this.ui = sttUiSchema.parse({ ...this.ui, ...patch });
    this.publish(this.ui);
  }
  async start(preview = false, test = false) {
    const cfg = structuredClone(this.config().stt);
    if (cfg.provider === 'none') return;
    if (
      this.active &&
      !preview &&
      !test &&
      !this.active.preview &&
      this.ui.status === 'recording'
    ) {
      this.stop();
      return;
    }
    if (preview && (this.active || this.ui.status === 'countdown')) return;
    if (!['openai-compatible-stt', 'mock'].includes(cfg.provider))
      throw new Error('This voice input provider is not implemented yet.');
    this.abort();
    if (cfg.provider === 'mock') {
      if (!this.config().advanced.developerMode)
        throw new Error('Mock voice input requires Developer Mode.');
      if (!preview) await this.commit(mockTranscript.text, cfg);
      return;
    }
    const id = randomUUID();
    this.active = {
      id,
      config: cfg,
      preview,
      test,
      stopping: false,
      released: false,
      index: 0,
      size: 0,
      chunks: [],
      controller: new AbortController(),
      provider: null,
      vad: new VoiceDetection(cfg.vadThreshold, cfg.silenceTimeoutMs),
    };
    this.update({
      status: 'starting',
      sessionId: id,
      level: 0,
      partial: '',
      notice: null,
      deadline: null,
    });
    if (!preview) this.lifecycle('listening');
    this.capture({
      type: 'start',
      sessionId: id,
      preview,
      deviceId: cfg.inputDeviceId,
      inputGain: cfg.inputGain,
      noiseSuppression: cfg.noiseSuppression,
      echoCancellation: cfg.echoCancellation,
      maxSeconds: preview ? 45 : test ? 3 : Math.min(120, cfg.maxUtteranceSec),
      sounds: !preview && cfg.startSound,
    });
    this.watchdog = setTimeout(
      () => {
        if (preview) this.abort();
        else this.stop();
      },
      (preview ? 45 : test ? 3 : Math.min(120, cfg.maxUtteranceSec)) * 1000 + 5000,
    );
  }
  frame(frame: SttFrame) {
    const session = this.active;
    if (!session || session.id !== frame.sessionId || session.preview || session.stopping) return;
    const bytes = Buffer.from(frame.pcm, 'base64');
    if (bytes.length !== 640 || frame.index !== session.index) {
      bytes.fill(0);
      this.fail('The recording stream was interrupted.');
      return;
    }
    session.index++;
    session.size += bytes.length;
    session.chunks.push(bytes);
    let sum = 0;
    for (let at = 0; at < bytes.length; at += 2) sum += (bytes.readInt16LE(at) / 32768) ** 2;
    const level = Math.min(1, Math.sqrt(sum / 320));
    if (session.index % 5 === 0) this.update({ level });
    const ended = session.vad.push(level);
    if (
      session.size >= 32 * 1024 * 1024 ||
      session.index * 20 >=
        (session.test ? 3000 : Math.min(120, session.config.maxUtteranceSec) * 1000) ||
      (!session.test && session.config.activation === 'hands-free' && ended)
    )
      this.stop();
  }
  feedback(feedback: SttFeedback) {
    if (feedback.type === 'released' && this.releasing.has(feedback.sessionId)) {
      clearTimeout(this.releasing.get(feedback.sessionId));
      this.releasing.delete(feedback.sessionId);
      if (!this.active) this.update({ microphoneOpen: this.releasing.size > 0, level: 0 });
      return;
    }
    const session = this.active;
    if (!session || feedback.sessionId !== session.id) return;
    if (feedback.type === 'ready') {
      if (session.stopping) {
        this.capture({ type: 'stop', sessionId: session.id });
        return;
      }
      this.devices.splice(0, this.devices.length, ...feedback.devices);
      this.update({
        permission: 'granted',
        microphoneOpen: true,
        status: session.preview ? 'preview' : 'recording',
      });
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(
        () => (session.preview ? this.abort() : this.stop()),
        (session.preview ? 45 : session.test ? 3 : Math.min(120, session.config.maxUtteranceSec)) *
          1000,
      );
    } else if (feedback.type === 'level' && session.preview) this.update({ level: feedback.level });
    else if (feedback.type === 'error') {
      if (feedback.code === 'denied') this.update({ permission: 'denied' });
      if (feedback.code === 'no-device') this.update({ permission: 'no-device' });
      if (feedback.code === 'device-lost') this.update({ permission: 'no-device' });
      this.fail(
        feedback.code === 'denied'
          ? 'Windows is blocking microphone access. Open Windows Microphone Settings.'
          : feedback.code === 'no-device' || feedback.code === 'device-lost'
            ? 'No microphone detected. Check the input device; the next recording will use the system default.'
            : 'The microphone could not start.',
      );
    } else if (feedback.type === 'released') {
      if (session.released) return;
      session.released = true;
      clearTimeout(this.releaseTimer);
      clearTimeout(this.watchdog);
      this.update({ microphoneOpen: this.releasing.size > 0, level: 0 });
      if (!session.stopping) {
        session.stopping = true;
        if (!session.preview) {
          this.update({ status: 'transcribing', notice: 'Transcribing…' });
          this.lifecycle('transcribing');
        }
      }
      if (session.preview) this.abort();
      else if (session.test && session.size) {
        this.capture({
          type: 'playback',
          sessionId: session.id,
          pcm: Buffer.concat(session.chunks).toString('base64'),
        });
        this.update({ notice: 'Playing microphone test…' });
      } else void this.transcribe(session);
    } else if (feedback.type === 'played' && session.test) void this.transcribe(session);
  }
  stop() {
    const session = this.active;
    if (!session || session.stopping) return;
    session.stopping = true;
    clearTimeout(this.watchdog);
    this.capture({ type: 'stop', sessionId: session.id });
    if (!session.preview) {
      this.update({
        status: 'transcribing',
        notice: session.test ? 'Playing microphone test…' : 'Transcribing…',
      });
      this.lifecycle('transcribing');
    }
    this.releaseTimer = setTimeout(() => {
      if (this.active === session && this.ui.microphoneOpen) this.forceRelease();
      else if (this.active === session) this.abort();
    }, 3000);
  }
  private async transcribe(session: Session) {
    if (this.active !== session) return;
    clearTimeout(this.releaseTimer);
    if (!session.size) {
      this.abort();
      return;
    }
    const pcm = Buffer.concat(session.chunks),
      clip = encodeWav(pcm);
    pcm.fill(0);
    for (const part of session.chunks) part.fill(0);
    session.chunks = [];
    const started = performance.now();
    try {
      session.provider = await createSTTProvider(session.config, () =>
        this.key(session.config.provider),
      );
      if (this.active !== session) {
        session.provider.dispose();
        return;
      }
      if (!session.provider.transcribe)
        throw new Error('This provider does not support batch transcription.');
      const result = await session.provider.transcribe(clip, {
        signal: session.controller.signal,
        mimeType: 'audio/wav',
        language: session.config.language,
        prompt: session.config.prompt,
      });
      if (this.active !== session) return;
      if (result.confidence !== undefined && result.confidence < session.config.minConfidence) {
        this.abort();
        this.update({
          notice: 'Transcript discarded because its confidence was below the configured threshold.',
        });
        return;
      }
      const text = processTranscript(result.text, session.config);
      this.abort();
      if (session.test)
        this.update({
          notice: `Microphone test: ${text.slice(0, 350) || 'No speech detected'} — ${Math.round(performance.now() - started)} ms.`,
        });
      else if (text) await this.commit(text, session.config);
    } catch {
      if (this.active === session && !session.controller.signal.aborted)
        this.fail(
          session.config.onFailure === 'discard'
            ? null
            : 'Transcription failed. Check the provider, endpoint and saved key; your typed text was kept.',
        );
    } finally {
      clip.fill(0);
      session.provider?.dispose();
    }
  }
  private async commit(text: string, cfg: Config['stt']) {
    if (!text.trim()) return;
    const epoch = this.epoch;
    this.recent = [...this.recent.slice(-4), text];
    await this.insert(text, cfg);
    if (epoch !== this.epoch) return;
    if (cfg.transcriptAction === 'send') await this.submit();
    else if (cfg.transcriptAction === 'countdown') {
      this.update({ status: 'countdown', deadline: Date.now() + cfg.countdownMs, notice: null });
      this.countdown = setTimeout(() => {
        if (epoch !== this.epoch) return;
        this.update({ status: 'idle', deadline: null });
        void this.submit();
      }, cfg.countdownMs);
    }
  }
  async reinsert() {
    const text = this.recent.at(-1);
    if (text) await this.insert(text, this.config().stt);
  }
  async testConnection() {
    const cfg = this.config().stt,
      provider = await createSTTProvider(cfg, () => this.key(cfg.provider)),
      started = performance.now();
    const clip = encodeWav(new Uint8Array(6400));
    try {
      if (!provider.transcribe) throw new Error('This provider cannot test a recording.');
      const result = await provider.transcribe(clip, {
        signal: AbortSignal.timeout(15000),
        mimeType: 'audio/wav',
        language: cfg.language,
        prompt: cfg.prompt,
      });
      return { elapsedMs: performance.now() - started, text: result.text };
    } finally {
      clip.fill(0);
      provider.dispose();
    }
  }
  private fail(notice: string | null) {
    this.abort();
    this.update({ notice });
  }
  private forceRelease() {
    const session = this.active;
    if (session) session.released = true;
    for (const timer of this.releasing.values()) clearTimeout(timer);
    this.releasing.clear();
    this.abort();
    this.releaseFailure();
    this.update({
      microphoneOpen: false,
      notice: 'Capture did not confirm release. The companion renderer was reloaded to close it.',
    });
  }
  abort() {
    ++this.epoch;
    clearTimeout(this.watchdog);
    clearTimeout(this.releaseTimer);
    clearTimeout(this.countdown);
    const session = this.active;
    this.active = null;
    if (session) {
      session.controller.abort();
      session.provider?.dispose();
      if (!session.released) {
        this.releasing.set(
          session.id,
          setTimeout(() => this.forceRelease(), 3000),
        );
      }
      this.capture({ type: 'stop', sessionId: session.id });
      for (const bytes of session.chunks) bytes.fill(0);
    }
    this.update({
      status: 'idle',
      sessionId: null,
      partial: '',
      level: 0,
      microphoneOpen: this.ui.microphoneOpen && this.releasing.size > 0,
      deadline: null,
    });
    if (session && !session.preview) this.lifecycle('idle');
  }
}
