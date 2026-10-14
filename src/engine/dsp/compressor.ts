import type { CompressorParams } from '@shared/params';
import { dbToLin, linToDb, smoothingCoef } from './math';

/** Feed-forward compressor with soft knee, make-up gain and a parallel (dry/wet) mix. */
export class Compressor {
  gainReductionDb = 0;

  private env = 0;
  private gDb = 0;
  private readonly peakRelease: number;
  private thresh = -20;
  private ratio = 3;
  private knee = 6;
  private attackCoef = 0;
  private releaseCoef = 0;
  private makeup = 1;
  private mix = 1;

  constructor(private readonly sampleRate: number, params?: CompressorParams) {
    this.peakRelease = smoothingCoef(5, sampleRate);
    if (params) this.set(params);
  }

  set(p: Pick<CompressorParams, 'thresh' | 'ratio' | 'attack' | 'release' | 'knee' | 'makeup' | 'mix'>): void {
    this.thresh = p.thresh;
    this.ratio = p.ratio;
    this.knee = Math.max(p.knee, 0.01);
    this.attackCoef = smoothingCoef(p.attack, this.sampleRate);
    this.releaseCoef = smoothingCoef(p.release, this.sampleRate);
    this.makeup = dbToLin(p.makeup);
    this.mix = p.mix / 100;
  }

  /** Static transfer curve: output level in dB for an input level in dB (before make-up). */
  static outputLevelDb(inDb: number, thresh: number, ratio: number, knee: number): number {
    const over = inDb - thresh;
    if (2 * over < -knee) return inDb;
    if (2 * Math.abs(over) <= knee) {
      const t = over + knee / 2;
      return inDb + ((1 / ratio - 1) * t * t) / (2 * knee);
    }
    return thresh + over / ratio;
  }

  process(x: number): number {
    const a = Math.abs(x);
    this.env = a > this.env ? a : a + this.peakRelease * (this.env - a);
    const inDb = linToDb(this.env);
    const target = Compressor.outputLevelDb(inDb, this.thresh, this.ratio, this.knee) - inDb;
    const c = target < this.gDb ? this.attackCoef : this.releaseCoef;
    this.gDb = target + c * (this.gDb - target);
    this.gainReductionDb = this.gDb;
    const g = dbToLin(this.gDb) * this.makeup;
    return x * (1 - this.mix) + x * g * this.mix;
  }
}
