import type { SttCapture } from '../../shared/stt';
import workletURL from './recorder.worklet.js?url&no-inline';
export class MicRecorder {
  private generation = 0;
  private id: string | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private output: GainNode | null = null;
  private replay: AudioBufferSourceNode | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sounds = false;
  renew(sessionId: string) {
    if (this.id === sessionId) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.stop(), 45000);
    }
  }
  async start(packet: Extract<SttCapture, { type: 'start' }>) {
    const generation = ++this.generation;
    await this.release();
    if (generation !== this.generation) return;
    this.id = packet.sessionId;
    this.sounds = packet.sounds;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          ...(packet.deviceId === 'default' ? {} : { deviceId: { exact: packet.deviceId } }),
          echoCancellation: packet.echoCancellation,
          noiseSuppression: packet.noiseSuppression !== 'off',
          autoGainControl: true,
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getAudioTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (generation !== this.generation) return;
            window.companion.sttFeedback({
              type: 'error',
              sessionId: packet.sessionId,
              code: 'device-lost',
            });
            void this.stop();
          },
          { once: true },
        ),
      );
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule(workletURL);
      await context.resume();
      if (generation !== this.generation) {
        await context.close();
        return;
      }
      const source = context.createMediaStreamSource(stream),
        gain = context.createGain(),
        output = context.createGain();
      gain.gain.value = packet.inputGain;
      output.gain.value = 0;
      const worklet = new AudioWorkletNode(context, 'companion-recorder', {
        processorOptions: { aggressive: packet.noiseSuppression === 'aggressive' },
      });
      this.source = source;
      this.gain = gain;
      this.worklet = worklet;
      this.output = output;
      let index = 0,
        lastLevel = 0;
      worklet.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        const data = event.data;
        if (
          generation !== this.generation ||
          !(data.pcm instanceof ArrayBuffer) ||
          data.pcm.byteLength !== 640 ||
          !Number.isFinite(data.level)
        )
          return;
        const bytes = new Uint8Array(data.pcm),
          level = Math.min(1, Math.max(0, data.level));
        if (packet.preview) {
          if (performance.now() - lastLevel >= 100) {
            lastLevel = performance.now();
            window.companion.sttFeedback({ type: 'level', sessionId: packet.sessionId, level });
          }
        } else {
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          window.companion.sendSttFrame({
            sessionId: packet.sessionId,
            index: index++,
            pcm: btoa(binary),
            level,
          });
        }
        bytes.fill(0);
      };
      source.connect(gain);
      gain.connect(worklet);
      worklet.connect(output);
      output.connect(context.destination);
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (generation !== this.generation) return;
      window.companion.sttFeedback({
        type: 'ready',
        sessionId: packet.sessionId,
        devices: devices
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({ id: device.deviceId, label: device.label })),
      });
      if (packet.sounds) this.tone(context, 660);
      this.timer = setTimeout(() => void this.stop(), packet.maxSeconds * 1000);
    } catch (error) {
      if (generation !== this.generation) return;
      const name = error instanceof DOMException ? error.name : '';
      window.companion.sttFeedback({
        type: 'error',
        sessionId: packet.sessionId,
        code:
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'no-device'
              : 'capture-error',
      });
      await this.stop();
    }
  }
  private tone(context: AudioContext, frequency: number) {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.07);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  async stop(sessionId = this.id) {
    if (sessionId && this.id && sessionId !== this.id) return;
    ++this.generation;
    await this.release(sessionId);
  }
  private async release(sessionId = this.id) {
    clearTimeout(this.timer);
    const id = sessionId,
      context = this.context;
    this.id = null;
    this.context = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.port.close();
    }
    this.source?.disconnect();
    this.gain?.disconnect();
    this.worklet?.disconnect();
    this.output?.disconnect();
    this.source = null;
    this.gain = null;
    this.worklet = null;
    this.output = null;
    if (this.replay) {
      this.replay.onended = null;
      try {
        this.replay.stop();
      } catch {
        /* Already stopped. */
      }
      this.replay.disconnect();
      this.replay = null;
    }
    if (context && context.state !== 'closed') {
      if (this.sounds) {
        this.tone(context, 440);
        await new Promise<void>((resolve) => setTimeout(resolve, 80));
      }
      await context.close().catch(() => undefined);
    }
    if (id) window.companion.sttFeedback({ type: 'released', sessionId: id });
  }
  async play(packet: Extract<SttCapture, { type: 'playback' }>) {
    const generation = ++this.generation;
    await this.release();
    if (generation !== this.generation) return;
    this.id = packet.sessionId;
    this.sounds = false;
    const context = new AudioContext();
    this.context = context;
    const data = atob(packet.pcm),
      buffer = context.createBuffer(1, data.length / 2, 16000),
      samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const value = data.charCodeAt(i * 2) | (data.charCodeAt(i * 2 + 1) << 8);
      samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.replay = source;
    await context.resume();
    if (generation !== this.generation) return;
    source.onended = () => {
      if (generation !== this.generation) return;
      samples.fill(0);
      source.disconnect();
      this.replay = null;
      void context.close();
      this.context = null;
      this.id = null;
      window.companion.sttFeedback({ type: 'played', sessionId: packet.sessionId });
    };
    source.start();
  }
}
