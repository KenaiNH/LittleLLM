/* global AudioWorkletProcessor, sampleRate, registerProcessor */
class CompanionRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / 16000;
    this.weight = 0;
    this.sum = 0;
    this.frame = new Int16Array(320);
    this.at = 0;
    this.energy = 0;
    this.aggressive = options?.processorOptions?.aggressive === true;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] ?? 0;
      value /= channels.length;
      // Area-weighted resampling keeps fractional rate/phase across render quanta.
      let available = 1;
      while (available > 0) {
        const used = Math.min(available, this.ratio - this.weight);
        this.sum += value * used;
        this.weight += used;
        available -= used;
        if (this.weight >= this.ratio - 1e-9) {
          const mono = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.frame[this.at++] = Math.round(mono * (mono < 0 ? 32768 : 32767));
          this.energy += mono * mono;
          this.weight = 0;
          this.sum = 0;
          if (this.at === 320) {
            let level = Math.sqrt(this.energy / 320);
            if (this.aggressive && level < 0.005) {
              this.frame.fill(0);
              level = 0;
            }
            this.port.postMessage({ pcm: this.frame.buffer, level }, [this.frame.buffer]);
            this.frame = new Int16Array(320);
            this.at = 0;
            this.energy = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('companion-recorder', CompanionRecorder);
