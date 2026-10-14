import { TWO_PI } from './math';

/** "Robot voice": multiplies the signal with a sine carrier and crossfades with the dry signal. */
export class RingModulator {
  private phase = 0;
  private increment = 0;
  private mix = 1;

  constructor(private readonly sampleRate: number) {}

  set(frequencyHz: number, mixPercent: number): void {
    this.increment = frequencyHz / this.sampleRate;
    this.mix = mixPercent / 100;
  }

  process(x: number): number {
    this.phase += this.increment;
    if (this.phase >= 1) this.phase -= 1;
    const carrier = Math.sin(TWO_PI * this.phase);
    return x * (1 - this.mix) + x * carrier * this.mix;
  }
}
