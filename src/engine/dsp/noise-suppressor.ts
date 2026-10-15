import { FFT } from './fft';

const FRAME = 512;
const HOP = FRAME / 2;
const BINS = FRAME / 2 + 1;
/** the noise floor estimate may rise by this factor per frame while the signal is above it */
const NOISE_RISE = 1.001;
/** time constant of the power smoothing used for the minimum tracker, in frames */
const POWER_SMOOTH = 0.7;
/** decision-directed smoothing of the a-priori SNR */
const DD_ALPHA = 0.9;
/** gain smoothing across frames, which suppresses "musical noise" */
const GAIN_SMOOTH = 0.55;
/** deepest attenuation at amount = 100 %, in dB */
const MAX_REDUCTION_DB = 30;

/**
 * Spectral noise suppressor (Wiener-style gain with a minimum-statistics noise estimate).
 *
 * 50 %-overlapped sqrt-Hann frames of 512 samples: the latency is exactly one frame (about 10 ms),
 * and the processing needs no model files. The noise floor is learned continuously from the
 * quietest parts of the signal, so it follows fans and hum without a calibration step.
 */
export class NoiseSuppressor {
  /** delay introduced by the suppressor, in samples */
  readonly latency = FRAME;

  private readonly fft = new FFT(FRAME);
  private readonly win = new Float32Array(FRAME);
  private readonly hist = new Float32Array(FRAME);
  private readonly acc = new Float32Array(FRAME);
  private readonly inChunk = new Float32Array(HOP);
  private readonly outChunk = new Float32Array(HOP);
  private inCount = 0;
  private outRead = 0;

  private readonly re = new Float64Array(FRAME);
  private readonly im = new Float64Array(FRAME);
  private readonly power = new Float64Array(BINS);
  private readonly smoothed = new Float64Array(BINS);
  private readonly noise = new Float64Array(BINS);
  private readonly gain = new Float64Array(BINS).fill(1);
  private readonly prevClean = new Float64Array(BINS);
  private frames = 0;
  private floorGain = 0.1;
  /** over-estimation of the noise floor: residue sounds worse than a little speech loss */
  private overEstimate = 2;

  constructor() {
    for (let i = 0; i < FRAME; i++) this.win[i] = Math.sin((Math.PI * (i + 0.5)) / FRAME);
    this.noise.fill(1e-6);
    this.setAmount(70);
  }

  /** 0..100 */
  setAmount(amount: number): void {
    const a = Math.min(100, Math.max(0, amount)) / 100;
    this.floorGain = Math.pow(10, -(a * MAX_REDUCTION_DB) / 20);
    this.overEstimate = 1.2 + 5 * a;
  }

  process(x: number): number {
    this.inChunk[this.inCount++] = x;
    const y = this.outChunk[this.outRead++]!;
    if (this.inCount >= HOP) {
      this.processFrame();
      this.inCount = 0;
      this.outRead = 0;
    }
    return y;
  }

  private processFrame(): void {
    const { re, im, win, power, smoothed, noise, gain, prevClean } = this;

    this.hist.copyWithin(0, HOP);
    this.hist.set(this.inChunk, FRAME - HOP);
    for (let i = 0; i < FRAME; i++) {
      re[i] = this.hist[i]! * win[i]!;
      im[i] = 0;
    }
    this.fft.forward(re, im);

    const warmup = this.frames < 24;
    for (let k = 0; k < BINS; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      power[k] = p;
      smoothed[k] = this.frames === 0 ? p : POWER_SMOOTH * smoothed[k]! + (1 - POWER_SMOOTH) * p;

      // minimum statistics: follow dips immediately, creep upwards slowly
      const n = noise[k]!;
      if (warmup) noise[k] = Math.max(1e-9, this.frames === 0 ? smoothed[k]! : Math.min(n, smoothed[k]!));
      else noise[k] = smoothed[k]! < n ? smoothed[k]! : Math.min(smoothed[k]!, n * NOISE_RISE);
    }
    this.frames++;

    for (let k = 0; k < BINS; k++) {
      const n = noise[k]! * this.overEstimate + 1e-12;
      const post = power[k]! / n;
      const prior = DD_ALPHA * (prevClean[k]! / n) + (1 - DD_ALPHA) * Math.max(post - 1, 0);
      let g = prior / (1 + prior);
      if (g < this.floorGain) g = this.floorGain;
      // fast open, slower close
      const smooth = g > gain[k]! ? 0.2 : GAIN_SMOOTH;
      gain[k] = smooth * gain[k]! + (1 - smooth) * g;
      prevClean[k] = gain[k]! * gain[k]! * power[k]!;
    }

    for (let k = 0; k < BINS; k++) {
      re[k] = re[k]! * gain[k]!;
      im[k] = im[k]! * gain[k]!;
    }
    im[0] = 0;
    im[BINS - 1] = 0;
    for (let k = 1; k < BINS - 1; k++) {
      re[FRAME - k] = re[k]!;
      im[FRAME - k] = -im[k]!;
    }
    this.fft.inverse(re, im);

    for (let i = 0; i < FRAME; i++) this.acc[i] = this.acc[i]! + re[i]! * win[i]!;
    this.outChunk.set(this.acc.subarray(0, HOP));
    this.acc.copyWithin(0, HOP);
    this.acc.fill(0, FRAME - HOP);
  }
}

export const NOISE_FRAME = FRAME;
