import type { ExpanderParams } from '@shared/params';
import { dbToLin, linToDb, smoothingCoef } from './math';

/**
 * Downward expander / noise gate with hold.
 * Below the threshold the signal is attenuated by `(thresh - level) * (ratio - 1)` dB, limited by `range`.
 */
export class Expander {
  /** Current gain in dB (0 or negative); exposed for metering. */
  gainReductionDb = 0;

  private env = 0;
  private gDb = 0;
  private hold = 0;
  private readonly detAttack: number;
  private readonly detRelease: number;
  private thresh = -58;
  private ratio = 2;
  private range = 18;
  private attackCoef = 0;
  private releaseCoef = 0;
  private holdSamples = 0;

  constructor(private readonly sampleRate: number, params?: ExpanderParams) {
    this.detAttack = smoothingCoef(0.5, sampleRate);
    this.detRelease = smoothingCoef(12, sampleRate);
    if (params) this.set(params);
  }

  set(p: Pick<ExpanderParams, 'thresh' | 'ratio' | 'attack' | 'release' | 'hold' | 'range'>): void {
    this.thresh = p.thresh;
    this.ratio = p.ratio;
    this.range = p.range;
    this.attackCoef = smoothingCoef(p.attack, this.sampleRate);
    this.releaseCoef = smoothingCoef(p.release, this.sampleRate);
    this.holdSamples = (p.hold * 0.001 * this.sampleRate) | 0;
  }

  process(x: number): number {
    const a = Math.abs(x);
    const c = a > this.env ? this.detAttack : this.detRelease;
    this.env = a + c * (this.env - a);
    const level = linToDb(this.env);

    let target: number;
    if (level >= this.thresh) {
      this.hold = this.holdSamples;
      target = 0;
    } else if (this.hold > 0) {
      this.hold--;
      target = 0;
    } else {
      target = -Math.min(this.range, (this.thresh - level) * (this.ratio - 1));
    }
    // opening is fast (attack), closing is slow (release)
    const cc = target > this.gDb ? this.attackCoef : this.releaseCoef;
    this.gDb = target + cc * (this.gDb - target);
    this.gainReductionDb = this.gDb;
    return x * dbToLin(this.gDb);
  }
}
