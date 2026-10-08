import type { Config } from '../../shared/config';
import type { CompanionState } from '../../shared/state';
import type { SpriteState } from '../../shared/enums';
import { DwellTimer } from './dwellTimer';

// Main owns lifecycle gates. Audio and microphone services call the same gates
// when they are installed; no renderer animation may terminate an active state.
export class StateController {
  private state: SpriteState = 'idle';
  private requestId: string | null = null;
  private thinkingStarted = 0;
  private minimum: ReturnType<typeof setTimeout> | undefined;
  private hasOutput = false;
  private streamComplete = false;
  private audioDrained = true;
  private dwellElapsed = false;
  private dwellStarted = false;
  private hovering = false;
  private override: SpriteState | null = null;
  private lifetime = new DwellTimer(() => {
    this.dwellElapsed = true;
    this.hideBubble();
    this.finish();
  });
  constructor(
    private config: () => Config,
    private emit: (state: CompanionState) => void,
    private hideBubble: () => void,
  ) {}
  get snapshot(): CompanionState {
    return { state: this.override ?? this.state, requestId: this.requestId };
  }
  private publish() {
    this.emit(this.snapshot);
  }
  private resetGates() {
    clearTimeout(this.minimum);
    this.minimum = undefined;
    this.lifetime.stop();
    this.hasOutput = false;
    this.streamComplete = false;
    this.audioDrained = true;
    this.dwellElapsed = false;
    this.dwellStarted = false;
  }
  begin(requestId: string) {
    this.resetGates();
    this.requestId = requestId;
    this.thinkingStarted = Date.now();
    this.state = 'thinking';
    this.publish();
  }
  output(requestId: string) {
    if (requestId !== this.requestId || (this.state !== 'thinking' && this.state !== 'speaking'))
      return;
    this.hasOutput = true;
    if (this.state === 'speaking' || this.minimum) return;
    const remaining = Math.max(
      0,
      this.config().sprite.minThinkingMs - (Date.now() - this.thinkingStarted),
    );
    const speak = () => {
      this.minimum = undefined;
      if (requestId !== this.requestId || this.state !== 'thinking') return;
      this.state = 'speaking';
      this.publish();
      this.startDwell();
      this.finish();
    };
    if (remaining) this.minimum = setTimeout(speak, remaining);
    else speak();
  }
  complete(requestId: string) {
    if (requestId !== this.requestId) return;
    this.streamComplete = true;
    // An empty successful reply has no speaking phase, but still expires normally.
    if (!this.hasOutput) {
      this.state = 'idle';
      this.publish();
    }
    this.startDwell();
    this.finish();
  }
  audio(requestId: string, drained: boolean) {
    if (requestId !== this.requestId) return;
    this.audioDrained = drained;
    if (!drained) this.output(requestId);
    this.startDwell();
    this.finish();
  }
  private startDwell() {
    if (
      this.dwellStarted ||
      !this.streamComplete ||
      (this.hasOutput && this.state === 'thinking') ||
      (this.config().bubble.waitForSpeech && !this.audioDrained)
    )
      return;
    this.dwellStarted = true;
    this.lifetime.pause(this.hovering && this.config().bubble.keepOpenOnHover);
    this.lifetime.start(this.config().bubble.dwellMs);
  }
  private finish() {
    if (
      !this.streamComplete ||
      !this.audioDrained ||
      !this.dwellElapsed ||
      (this.hasOutput && this.state === 'thinking')
    )
      return;
    this.cancel();
  }
  hover(hovering: boolean) {
    this.hovering = hovering;
    this.lifetime.pause(hovering && this.config().bubble.keepOpenOnHover);
  }
  settingsChanged() {
    this.hover(this.hovering);
  }
  fail(requestId: string) {
    if (requestId !== this.requestId) return;
    this.cancel(undefined, true);
  }
  cancel(requestId?: string, retainBubble = false) {
    if (requestId && requestId !== this.requestId) return;
    this.resetGates();
    this.requestId = null;
    this.state = 'idle';
    this.publish();
    if (retainBubble) {
      this.lifetime.pause(this.hovering && this.config().bubble.keepOpenOnHover);
      this.lifetime.start(this.config().bubble.dwellMs);
    }
  }
  listen() {
    // Caller must abort generation and playback before entering listening.
    this.resetGates();
    this.requestId = null;
    this.state = 'listening';
    this.publish();
  }
  transcribing() {
    if (this.state !== 'listening') return;
    this.state = 'thinking';
    this.publish();
  }
  transcript(requestId: string | null) {
    if (requestId) this.begin(requestId);
    else this.cancel();
  }
  force(state: SpriteState | 'auto') {
    this.override = state === 'auto' ? null : state;
    this.publish();
  }
  dispose() {
    this.resetGates();
  }
}
