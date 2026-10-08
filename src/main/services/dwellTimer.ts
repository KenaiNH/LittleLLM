export class DwellTimer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = 0;
  private started = 0;
  private paused = false;
  private active = false;
  constructor(private elapsed: () => void) {}
  start(ms: number) {
    this.stop();
    this.remaining = ms;
    this.active = ms > 0;
    this.schedule();
  }
  pause(value: boolean) {
    if (this.paused === value) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.remaining = Math.max(0, this.remaining - (Date.now() - this.started));
    }
    this.paused = value;
    this.schedule();
  }
  private schedule() {
    if (!this.active || this.paused) return;
    this.started = Date.now();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.active = false;
      this.elapsed();
    }, this.remaining);
  }
  stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.active = false;
  }
}
