import type { Config } from '../../shared/config';
import { activePersona } from './persona';

/** Visibility owns the timer; a busy cycle is dropped and never queued. */
export class GreetingScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private launched = false;
  constructor(
    private config: () => Config,
    private busy: () => boolean,
    private fire: () => void,
    private day: { get(): string | null; set(day: string): void },
    private now: () => Date = () => new Date(),
  ) {}
  show() {
    this.hide();
    const cfg = this.config();
    if (!activePersona(cfg) || cfg.persona.greeting.mode === 'off') return;
    const frequency = cfg.persona.greeting.frequency;
    const date = this.now(),
      key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (
      (frequency === 'per-launch' && this.launched) ||
      (frequency === 'daily' && this.day.get() === key)
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const current = this.config();
      if (!activePersona(current) || current.persona.greeting.mode === 'off' || this.busy()) return;
      this.launched = true;
      if (frequency === 'daily') this.day.set(key);
      this.fire();
    }, cfg.persona.greeting.delayMs);
  }
  hide() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
