export class VoiceDetection {
  private onset = 0;
  private silent = 0;
  speaking = false;
  constructor(
    private threshold: number,
    private hangover: number,
  ) {}
  push(level: number, ms = 20) {
    if (level >= this.threshold) {
      this.onset += ms;
      this.silent = 0;
    } else {
      this.onset = 0;
      if (this.speaking) this.silent += ms;
    }
    if (this.onset >= 300) this.speaking = true;
    return this.speaking && this.silent >= this.hangover;
  }
}
