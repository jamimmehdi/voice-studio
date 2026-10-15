import type { BreathParams } from '@shared/params';
import { Biquad, biquadCoeffs } from './biquad';
import { dbToLin, linToDb, smoothingCoef } from './math';

/**
 * "Breath and clicks": softens mouth clicks and loud breaths, which pitch shifting exaggerates.
 *
 * - **Clicks** are very short, bright spikes far above the surrounding level. They are caught by
 *   comparing a fast high-band envelope with a slow one, and ducked for a few milliseconds.
 * - **Breaths** are noisy (mostly high-frequency) and sit between silence and speech. While the
 *   signal is noisy and well below the recent speech level, the gain is reduced.
 *
 * Speech itself is voiced (strong low band), so it passes untouched.
 */
export class BreathReducer {
  /** current gain in dB (0 or negative); exposed for tests */
  gainDb = 0;

  private readonly hp = new Biquad();
  private readonly lp = new Biquad();
  private clicks = 0;
  private breaths = 0;

  private fast = 0;
  private slow = 1e-4;
  private lowEnv = 0;
  private highEnv = 0;
  private allEnv = 0;
  private speechRef = 0;
  private holdSamples = 0;
  private clickGain = 1;
  private breathGain = 1;

  private readonly fastAttack: number;
  private readonly fastRelease: number;
  private readonly slowCoef: number;
  private readonly bandCoef: number;
  private readonly levelAttack: number;
  private readonly levelRelease: number;
  private readonly speechFall: number;
  private readonly gainAttack: number;
  private readonly gainRelease: number;
  private readonly clickHold: number;

  constructor(sampleRate: number) {
    this.hp.set(biquadCoeffs('highpass', sampleRate, 3500, 0.7));
    this.lp.set(biquadCoeffs('lowpass', sampleRate, 1200, 0.7));
    this.fastAttack = smoothingCoef(0.15, sampleRate);
    this.fastRelease = smoothingCoef(1.5, sampleRate);
    this.slowCoef = smoothingCoef(60, sampleRate);
    this.bandCoef = smoothingCoef(15, sampleRate);
    this.levelAttack = smoothingCoef(5, sampleRate);
    this.levelRelease = smoothingCoef(80, sampleRate);
    this.speechFall = smoothingCoef(4000, sampleRate);
    this.gainAttack = smoothingCoef(12, sampleRate);
    this.gainRelease = smoothingCoef(90, sampleRate);
    this.clickHold = Math.round(sampleRate * 0.004);
  }

  set(p: Pick<BreathParams, 'clicks' | 'breath'>): void {
    this.clicks = Math.min(100, Math.max(0, p.clicks)) / 100;
    this.breaths = Math.min(100, Math.max(0, p.breath)) / 100;
  }

  process(x: number): number {
    const a = Math.abs(x);

    // --- clicks: bright and sudden -----------------------------------------------------------
    const high = this.hp.process(x);
    const ah = Math.abs(high);
    this.fast = ah + (ah > this.fast ? this.fastAttack : this.fastRelease) * (this.fast - ah);
    this.slow = ah + this.slowCoef * (this.slow - ah);
    const isClick = this.clicks > 0 && this.fast > 0.02 && this.fast > this.slow * 9 + 0.01;
    if (isClick) this.holdSamples = this.clickHold;
    let clickTarget = 1;
    if (this.holdSamples > 0) {
      this.holdSamples--;
      clickTarget = 1 - 0.85 * this.clicks;
    }
    this.clickGain =
      clickTarget + (clickTarget < this.clickGain ? 0.2 : 0.9) * (this.clickGain - clickTarget);

    // --- breaths: noisy, soft and under the speech --------------------------------------------
    const low = Math.abs(this.lp.process(x));
    this.lowEnv = low + this.bandCoef * (this.lowEnv - low);
    this.highEnv = ah + this.bandCoef * (this.highEnv - ah);
    this.allEnv = a + (a > this.allEnv ? this.levelAttack : this.levelRelease) * (this.allEnv - a);
    if (this.allEnv > this.speechRef) this.speechRef = this.allEnv;
    else this.speechRef = this.allEnv + this.speechFall * (this.speechRef - this.allEnv);

    const noisy = this.highEnv > this.lowEnv * 0.9;
    // only once real speech has been heard does "far below speech" mean anything
    const quietForSpeech = this.speechRef > 0.03 && this.allEnv < this.speechRef * 0.3;
    const audible = this.allEnv > 0.002;
    const breathTarget =
      this.breaths > 0 && noisy && quietForSpeech && audible ? dbToLin(-18 * this.breaths) : 1;
    const c = breathTarget < this.breathGain ? this.gainAttack : this.gainRelease;
    this.breathGain = breathTarget + c * (this.breathGain - breathTarget);

    const g = this.clickGain * this.breathGain;
    this.gainDb = linToDb(g);
    return x * g;
  }
}
