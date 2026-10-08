import type { Config } from '../../shared/config';
import type { TTSFeedback, TTSPacket } from '../../shared/tts';
import type { TTSProvider } from './types';
import { createTTSProvider } from './registry';
import { AudioCache, audioCacheKey } from './audioCache';
import { markdownToSpeech } from './markdownToSpeech';
import { SentenceChunker } from './sentenceChunker';
type Turn = {
  id: string;
  cfg: Config['tts'];
  chunker: SentenceChunker;
  queue: string[];
  count: number;
  next: number;
  pending: Set<number>;
  audible: number | null;
  generating: boolean;
  complete: boolean;
  running: boolean;
  finishAt: number | null;
  controller: AbortController;
  provider: TTSProvider | null;
  failed: boolean;
  wake: (() => void) | null;
  completion: Promise<number>;
  resolve: (firstAudioMs: number) => void;
  reject: (e: Error) => void;
  startedAt: number;
  firstAudioMs: number | null;
};
export class SpeechService {
  private active: Turn | null = null;
  readonly cache: AudioCache;
  constructor(
    directory: string,
    private send: (event: TTSPacket) => void,
    private gate: (id: string, drained: boolean) => void,
    private notice: (id: string, text: string, error: boolean) => void,
    private drained: () => void,
    private key: (provider: Config['tts']['provider']) => Promise<string | undefined>,
    private factory: typeof createTTSProvider = createTTSProvider,
  ) {
    this.cache = new AudioCache(directory);
  }
  get hasSpeech() {
    return Boolean(
      this.active &&
      (this.active.generating || this.active.pending.size || this.active.queue.length),
    );
  }
  begin(id: string, cfg: Config['tts']) {
    this.abort();
    cfg = structuredClone(cfg);
    try {
      this.cache.scope(cfg);
    } catch {
      cfg.cacheAudio = false;
    }
    let resolve!: (firstAudioMs: number) => void, reject!: (e: Error) => void;
    const completion = new Promise<number>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Chat delivery is independent of this optional layer; previews explicitly await it.
    void completion.catch(() => undefined);
    this.active = {
      id,
      cfg: structuredClone(cfg),
      chunker: new SentenceChunker(),
      queue: [],
      count: 0,
      next: 0,
      pending: new Set(),
      audible: null,
      generating: false,
      complete: false,
      running: false,
      finishAt: null,
      controller: new AbortController(),
      provider: null,
      failed: false,
      wake: null,
      completion,
      resolve,
      reject,
      startedAt: performance.now(),
      firstAudioMs: null,
    };
  }
  push(id: string, text: string, final = false) {
    const turn = this.active;
    if (!turn || turn.id !== id || turn.failed || turn.finishAt !== null) return;
    for (const raw of turn.chunker.push(text, final)) {
      const converted = markdownToSpeech(raw, turn.cfg);
      const room = turn.cfg.maxSpeechChars - turn.count;
      if (room <= 0) break;
      const speech = converted.slice(0, room).trim();
      if (speech) {
        turn.queue.push(
          ...new SentenceChunker(false)
            .push(speech, true)
            .map((part) => part.trim())
            .filter(Boolean),
        );
        turn.count += speech.length;
        this.gate(id, false);
      }
    }
    turn.complete ||= final;
    if (turn.cfg.beginSpeaking === 'first-sentence' || final) void this.run(turn);
  }
  preview(id: string, cfg: Config['tts'], text: string) {
    this.begin(id, cfg);
    const turn = this.active;
    if (!turn) throw new Error('Speech could not start.');
    this.push(id, text, true);
    return turn.completion;
  }
  finishSentence() {
    const turn = this.active;
    if (!turn || turn.audible === null) {
      this.abort();
      return;
    }
    turn.finishAt = turn.audible;
    turn.queue = [];
    turn.complete = true;
    for (const segment of turn.pending) if (segment !== turn.finishAt) turn.pending.delete(segment);
    this.send({ type: 'finish', requestId: turn.id, segment: turn.finishAt });
    if (turn.next - 1 !== turn.finishAt) turn.controller.abort();
    turn.wake?.();
  }
  feedback(event: TTSFeedback) {
    const turn = this.active;
    if (!turn || turn.id !== event.requestId || !turn.pending.has(event.segment)) return;
    if (event.status === 'warning') {
      this.notice(turn.id, event.message ?? 'The audio output changed.', false);
      return;
    }
    if (event.status === 'started') {
      turn.audible = event.segment;
      turn.firstAudioMs ??= performance.now() - turn.startedAt;
    } else if (event.status === 'error')
      this.fail(
        turn,
        new Error('Speech could not be played. Check Voice settings and the output device.'),
      );
    else {
      turn.pending.delete(event.segment);
      if (turn.audible === event.segment) turn.audible = null;
      turn.wake?.();
      this.finish(turn);
    }
  }
  abort() {
    const turn = this.active;
    if (!turn) return;
    this.active = null;
    turn.controller.abort();
    turn.provider?.dispose();
    turn.queue = [];
    turn.pending.clear();
    turn.wake?.();
    this.send({ type: 'stop', requestId: turn.id });
    this.gate(turn.id, true);
    turn.reject(new DOMException('Cancelled', 'AbortError'));
  }
  private finish(turn: Turn) {
    if (
      this.active !== turn ||
      !turn.complete ||
      turn.running ||
      turn.generating ||
      turn.queue.length ||
      turn.pending.size
    )
      return;
    this.active = null;
    turn.provider?.dispose();
    this.gate(turn.id, true);
    turn.resolve(turn.firstAudioMs ?? 0);
    this.drained();
  }
  private fail(turn: Turn, error: unknown) {
    if (this.active !== turn) return;
    turn.failed = true;
    turn.complete = true;
    turn.queue = [];
    turn.pending.clear();
    turn.controller.abort();
    this.send({ type: 'stop', requestId: turn.id });
    this.gate(turn.id, true);
    this.notice(
      turn.id,
      turn.cfg.onFailure === 'notify'
        ? 'Speech failed. The reply is still available as text.'
        : 'Speech unavailable — continuing as text.',
      turn.cfg.onFailure === 'notify',
    );
    turn.reject(error instanceof Error ? error : new Error('Speech failed.'));
    this.active = null;
    turn.provider?.dispose();
    turn.wake?.();
    this.drained();
  }
  private async run(turn: Turn) {
    if (turn.running || this.active !== turn) return;
    turn.running = true;
    try {
      turn.provider ??= await this.factory(turn.cfg, () => this.key(turn.cfg.provider));
      while (this.active === turn && turn.queue.length && turn.finishAt === null) {
        if (turn.pending.size >= 2) {
          await new Promise<void>((resolve) => {
            turn.wake = resolve;
          });
          turn.wake = null;
          continue;
        }
        const text = turn.queue.shift();
        if (text === undefined) break;
        const segment = turn.next++;
        turn.generating = true;
        turn.pending.add(segment);
        try {
          await this.synthesize(turn, text, segment, turn.provider);
        } catch (error) {
          if (this.active !== turn || turn.finishAt !== null) break;
          if (turn.cfg.onFailure !== 'sapi' || turn.provider.id === 'windows-sapi') throw error;
          // Clear any partially received utterance before retrying with offline Windows speech.
          this.send({ type: 'stop', requestId: turn.id });
          turn.pending.clear();
          turn.provider.dispose();
          turn.provider = await this.factory(
            { ...turn.cfg, provider: 'windows-sapi', voice: '' },
            async () => undefined,
          );
          turn.pending.add(segment);
          this.notice(turn.id, 'Using the Windows voice because the speech server failed.', false);
          await this.synthesize(turn, text, segment, turn.provider);
        } finally {
          turn.generating = false;
        }
      }
    } catch (error) {
      if (this.active === turn && turn.finishAt === null) this.fail(turn, error);
    } finally {
      turn.running = false;
      if (this.active !== turn) turn.provider?.dispose();
      this.finish(turn);
    }
  }
  private async synthesize(turn: Turn, text: string, segment: number, provider: TTSProvider) {
    const format =
      provider.id === 'windows-sapi'
        ? 'wav'
        : provider.id === 'elevenlabs'
          ? 'mp3'
          : provider.id === 'custom-http'
            ? turn.cfg.custom.format
            : turn.cfg.format;
    const cfg =
      provider.id === 'windows-sapi' && turn.cfg.provider !== 'windows-sapi'
        ? { ...turn.cfg, provider: 'windows-sapi' as const, voice: '' }
        : turn.cfg;
    const cacheKey = audioCacheKey(cfg, text, format);
    let cached: Uint8Array | null = null;
    if (cfg.cacheAudio) {
      try {
        cached = this.cache.get(cacheKey);
      } catch {
        /* Cache I/O is optional. */
      }
    }
    if (this.active !== turn || (turn.finishAt !== null && turn.finishAt !== segment)) return;
    this.send({ type: 'start', requestId: turn.id, segment, format });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const iterable = cached
      ? (async function* () {
          yield cached;
        })()
      : provider.synthesize(text, {
          signal: turn.controller.signal,
          voice: cfg.voice,
          speed: cfg.speed,
          format,
        });
    for await (const chunk of iterable) {
      if (this.active !== turn || (turn.finishAt !== null && turn.finishAt !== segment)) return;
      turn.controller.signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('Audio budget exceeded.');
      if (cfg.cacheAudio && !cached) chunks.push(chunk.slice());
      for (let at = 0; at < chunk.length; at += 48 * 1024)
        this.send({
          type: 'data',
          requestId: turn.id,
          segment,
          data: Buffer.from(chunk.subarray(at, at + 48 * 1024)).toString('base64'),
        });
    }
    turn.controller.signal.throwIfAborted();
    if (this.active !== turn) return;
    if (!bytes) throw new Error('No speech audio was returned.');
    if (!cached && cfg.cacheAudio) {
      try {
        this.cache.put(cacheKey, Buffer.concat(chunks));
      } catch {
        /* A full disk must not interrupt speech. */
      }
    }
    this.send({ type: 'end', requestId: turn.id, segment });
  }
}
