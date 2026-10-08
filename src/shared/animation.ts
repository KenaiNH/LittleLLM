import type { SpriteStateConfig } from './config';
export function sheetFrames(
  imageWidth: number,
  imageHeight: number,
  cfg: SpriteStateConfig,
): { x: number; y: number; width: number; height: number }[] {
  const width = cfg.frameWidth ?? imageWidth,
    height = cfg.frameHeight ?? imageHeight;
  const columns = cfg.columns ?? Math.floor(imageWidth / width),
    rows = Math.floor(imageHeight / height);
  if (columns < 1 || rows < 1 || columns * width > imageWidth)
    throw new Error('Frames do not fit the sheet');
  const count = cfg.frameCount ?? columns * rows;
  if (count < 1 || count > 512 || count > columns * rows)
    throw new Error('Invalid sheet frame count');
  return Array.from({ length: count }, (_, i) => ({
    x: (cfg.frameOrder === 'row-major' ? i % columns : Math.floor(i / rows)) * width,
    y: (cfg.frameOrder === 'row-major' ? Math.floor(i / columns) : i % rows) * height,
    width,
    height,
  }));
}
export class AnimationClock {
  frame = 0;
  finished = false;
  private accumulator = 0;
  private previous: number | undefined;
  private direction = 1;
  constructor(
    readonly delays: number[],
    readonly mode: SpriteStateConfig['playbackMode'],
  ) {
    if (!delays.length || delays.some((t) => !Number.isFinite(t) || t <= 0))
      throw new Error('Invalid frame delays');
  }
  pause() {
    this.previous = undefined;
  }
  reset() {
    this.frame = 0;
    this.finished = false;
    this.accumulator = 0;
    this.direction = 1;
    this.pause();
  }
  seek(frame: number) {
    this.frame = Math.max(0, Math.min(this.delays.length - 1, Math.floor(frame)));
    this.accumulator = 0;
    this.pause();
  }
  tick(now: number): { frame: number; changed: boolean; returnToIdle: boolean } {
    const before = this.frame;
    if (this.previous === undefined) {
      this.previous = now;
      return { frame: this.frame, changed: false, returnToIdle: false };
    }
    this.accumulator += Math.max(0, now - this.previous);
    this.previous = now;
    if (this.finished)
      return { frame: this.frame, changed: false, returnToIdle: this.mode === 'once-idle' };
    // At most one full playback-cycle worth of missed steps is needed for loops.
    const cycle = this.delays.reduce((a, b) => a + b, 0);
    if (this.mode === 'loop' && this.accumulator > cycle) this.accumulator %= cycle;
    while (this.accumulator >= (this.delays[this.frame] ?? Infinity) && !this.finished) {
      this.accumulator -= this.delays[this.frame] ?? 0;
      if (this.mode === 'ping-pong') {
        if (this.delays.length === 1) break;
        if (this.frame + this.direction >= this.delays.length || this.frame + this.direction < 0)
          this.direction *= -1;
        this.frame += this.direction;
      } else if (this.frame + 1 < this.delays.length) this.frame++;
      else if (this.mode === 'loop') this.frame = 0;
      else this.finished = true;
    }
    return {
      frame: this.frame,
      changed: before !== this.frame,
      returnToIdle: this.finished && this.mode === 'once-idle',
    };
  }
}
export function mouthFrame(
  level: number,
  previous: number,
  config: { smoothing: number; sensitivity: number; silenceThreshold: number; frameCount: number },
): { level: number; index: number } {
  const smoothed = config.smoothing * previous + (1 - config.smoothing) * Math.max(0, level);
  const normalized = Math.min(1, smoothed * config.sensitivity);
  return {
    level: smoothed,
    index:
      level < config.silenceThreshold
        ? 0
        : Math.min(config.frameCount - 1, Math.floor(normalized * config.frameCount)),
  };
}
