import { FFT } from './fft';
import { PI, TWO_PI } from './math';

/**
 * Phase-vocoder pitch shifter with cepstral formant control.
 *
 * - `pitchRatio` moves the harmonics (frequency scaling of the flattened spectrum).
 * - `formantRatio` independently moves the spectral envelope (vocal-tract size).
 *
 * Latency is exactly `size` samples; quality improves with frame size
 * (a 115 Hz voice needs bins finer than ~25 Hz, hence 2048 @ 48 kHz).
 */
export class PitchShifter {
  readonly size: number;
  private readonly half: number;
  private readonly osamp = 4;
  private readonly hop: number;
  private readonly fft: FFT;
  private readonly win: Float32Array;
  private readonly hist: Float32Array;
  private readonly acc: Float32Array;
  private readonly inChunk: Float32Array;
  private readonly outChunk: Float32Array;
  private inCount = 0;
  private outRead = 0;

  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly mag: Float64Array;
  private readonly freq: Float64Array;
  private readonly lastPhase: Float64Array;
  private readonly sumPhase: Float64Array;
  private readonly env: Float64Array;
  private readonly synMag: Float64Array;
  private readonly synFreq: Float64Array;
  private readonly lifter: number;

  private pitchRatio = 1;
  private formantRatio = 1;

  constructor(sampleRate: number, size: number) {
    this.size = size;
    this.half = size / 2;
    this.hop = size / this.osamp;
    this.fft = new FFT(size);
    this.win = new Float32Array(size);
    for (let i = 0; i < size; i++) this.win[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / size);
    this.hist = new Float32Array(size);
    this.acc = new Float32Array(size);
    this.inChunk = new Float32Array(this.hop);
    this.outChunk = new Float32Array(this.hop);

    const bins = this.half + 1;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.mag = new Float64Array(bins);
    this.freq = new Float64Array(bins);
    this.lastPhase = new Float64Array(bins);
    this.sumPhase = new Float64Array(bins);
    this.env = new Float64Array(bins + 1);
    this.synMag = new Float64Array(bins);
    this.synFreq = new Float64Array(bins);
    this.lifter = Math.max(8, Math.round(sampleRate / 600));
  }

  /** Delay introduced by the shifter, in samples. */
  get latency(): number {
    return this.size;
  }

  setShift(pitchSemitones: number, formantSemitones: number): void {
    this.pitchRatio = Math.pow(2, pitchSemitones / 12);
    this.formantRatio = Math.pow(2, formantSemitones / 12);
  }

  process(x: number): number {
    this.inChunk[this.inCount++] = x;
    const y = this.outChunk[this.outRead++]!;
    if (this.inCount >= this.hop) {
      this.processFrame();
      this.inCount = 0;
      this.outRead = 0;
    }
    return y;
  }

  private processFrame(): void {
    const { size: n, half, hop, osamp, re, im, win, mag, freq, env } = this;
    const expct = (TWO_PI * hop) / n;

    this.hist.copyWithin(0, hop);
    this.hist.set(this.inChunk, n - hop);
    for (let i = 0; i < n; i++) {
      re[i] = this.hist[i]! * win[i]!;
      im[i] = 0;
    }
    this.fft.forward(re, im);

    // analysis: magnitude and true frequency (in bins)
    for (let k = 0; k <= half; k++) {
      const r = re[k]!, i = im[k]!;
      mag[k] = Math.sqrt(r * r + i * i);
      const ph = Math.atan2(i, r);
      let d = ph - this.lastPhase[k]! - k * expct;
      this.lastPhase[k] = ph;
      d -= TWO_PI * Math.round(d / TWO_PI);
      freq[k] = k + (d * osamp) / TWO_PI;
    }

    // spectral envelope through cepstral liftering
    for (let k = 0; k <= half; k++) {
      re[k] = Math.log(mag[k]! + 1e-9);
      im[k] = 0;
    }
    for (let k = 1; k < half; k++) {
      re[n - k] = re[k]!;
      im[n - k] = 0;
    }
    this.fft.inverse(re, im);
    const L = this.lifter;
    const L2 = L * 1.5;
    for (let q = 0; q < n; q++) {
      const qq = q <= half ? q : n - q;
      let w: number;
      if (qq <= L) w = 1;
      else if (qq < L2) w = 0.5 * (1 + Math.cos((PI * (qq - L)) / (L2 - L)));
      else w = 0;
      re[q] = re[q]! * w;
      im[q] = 0;
    }
    this.fft.forward(re, im);
    for (let k = 0; k <= half; k++) env[k] = Math.exp(re[k]!);
    env[half + 1] = env[half]!;

    // pitch shift of the flattened spectrum
    const { synMag, synFreq } = this;
    synMag.fill(0);
    synFreq.fill(0);
    const p = this.pitchRatio;
    for (let k = 0; k <= half; k++) {
      const idx = Math.round(k * p);
      if (idx > half) break;
      synMag[idx] = synMag[idx]! + mag[k]! / (env[k]! + 1e-9);
      synFreq[idx] = freq[k]! * p;
    }

    // re-apply the (shifted) envelope and synthesise phases
    const invF = 1 / this.formantRatio;
    for (let k = 0; k <= half; k++) {
      let pos = k * invF;
      if (pos > half) pos = half;
      const i0 = pos | 0;
      const fr = pos - i0;
      const e = env[i0]! * (1 - fr) + env[i0 + 1]! * fr;
      const m = synMag[k]! * e;
      const inc = (TWO_PI * (synFreq[k]! - k)) / osamp + k * expct;
      let sp = this.sumPhase[k]! + inc;
      if (sp > 1e6 || sp < -1e6) sp %= TWO_PI;
      this.sumPhase[k] = sp;
      re[k] = m * Math.cos(sp);
      im[k] = m * Math.sin(sp);
    }
    im[0] = 0;
    im[half] = 0;
    for (let k = 1; k < half; k++) {
      re[n - k] = re[k]!;
      im[n - k] = -im[k]!;
    }
    this.fft.inverse(re, im);

    const norm = 1 / 1.5; // sum of Hann^2 at 75 % overlap
    for (let i = 0; i < n; i++) this.acc[i] = this.acc[i]! + re[i]! * win[i]! * norm;
    this.outChunk.set(this.acc.subarray(0, hop));
    this.acc.copyWithin(0, hop);
    this.acc.fill(0, n - hop);
  }
}
