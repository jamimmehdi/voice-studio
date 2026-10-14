import type { DeEsserParams } from '@shared/params';
import { Biquad, biquadCoeffs } from './biquad';
import { dbToLin, linToDb, smoothingCoef } from './math';

/**
 * Split-band de-esser: a band-pass isolates the sibilance, which is compressed on its own and
 * summed back with the remainder (so non-sibilant content stays bit-identical at unity gain).
 * Wide-band mode instead ducks the whole signal.
 */
export class DeEsser {
  gainReductionDb = 0;

  private readonly band = new Biquad();
  private env = 0;
  private gDb = 0;
  private readonly detAttack: number;
  private readonly detRelease: number;
  private readonly attackCoef: number;
  private readonly releaseCoef: number;
  private thresh = -32;
  private ratio = 4;
  private range = 12;
  private wide = false;
  private listen = false;

  constructor(private readonly sampleRate: number, params?: DeEsserParams) {
    this.detAttack = smoothingCoef(0.3, sampleRate);
    this.detRelease = smoothingCoef(15, sampleRate);
    this.attackCoef = smoothingCoef(0.5, sampleRate);
    this.releaseCoef = smoothingCoef(40, sampleRate);
    if (params) this.set(params);
  }

  set(p: Pick<DeEsserParams, 'freq' | 'q' | 'thresh' | 'ratio' | 'range' | 'mode' | 'listen'>): void {
    this.band.set(biquadCoeffs('bandpass', this.sampleRate, p.freq, p.q, 0));
    this.thresh = p.thresh;
    this.ratio = p.ratio;
    this.range = p.range;
    this.wide = p.mode === 1;
    this.listen = p.listen;
  }

  process(x: number): number {
    const band = this.band.process(x);
    const a = Math.abs(band);
    const c = a > this.env ? this.detAttack : this.detRelease;
    this.env = a + c * (this.env - a);
    const level = linToDb(this.env);
    const over = level - this.thresh;
    const target = over > 0 ? -Math.min(this.range, over * (1 - 1 / this.ratio)) : 0;
    const cc = target < this.gDb ? this.attackCoef : this.releaseCoef;
    this.gDb = target + cc * (this.gDb - target);
    this.gainReductionDb = this.gDb;
    const g = dbToLin(this.gDb);
    if (this.listen) return band;
    return this.wide ? x * g : x - band + band * g;
  }
}
