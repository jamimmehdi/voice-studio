/**
 * Detects acoustic feedback ("howl"): speakers feed the microphone, which feeds the speakers.
 *
 * It looks at the spectrum of the processed signal about ten times a second and flags a single tone
 * that (1) stands far above everything else, (2) stays on the same frequency and (3) keeps growing.
 * A held vowel has many harmonics and does not grow, so it never matches.
 */
export interface FeedbackOptions {
  /** analyser bin width in Hz */
  binHz: number;
  /** how far the tone must stand above the next independent peak, in dB */
  dominanceDb?: number;
  /** minimum absolute level of the tone, in dB full scale */
  minLevelDb?: number;
  /** required growth over the window, in dB */
  growthDb?: number;
  /** length of the window, in ticks */
  windowTicks?: number;
}

const DEFAULTS = { dominanceDb: 18, minLevelDb: -45, growthDb: 6, windowTicks: 8 } as const;

/** lowest frequency considered: below this is rumble and handling noise */
const MIN_HZ = 250;

export class FeedbackDetector {
  private readonly opt: Required<FeedbackOptions>;
  private history: Array<{ bin: number; db: number }> = [];

  constructor(options: FeedbackOptions) {
    this.opt = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.history = [];
  }

  /** Feed one spectrum (dB values per bin). Returns true while feedback is building up. */
  feed(spectrumDb: ArrayLike<number>): boolean {
    const o = this.opt;
    const first = Math.max(2, Math.ceil(MIN_HZ / o.binHz));
    let peak = -Infinity;
    let bin = -1;
    for (let k = first; k < spectrumDb.length; k++) {
      const v = spectrumDb[k]!;
      if (v > peak) {
        peak = v;
        bin = k;
      }
    }
    if (bin < 0 || peak < o.minLevelDb) {
      this.history = [];
      return false;
    }

    // the strongest peak that is not part of the same tone (outside +-3 bins)
    let other = -Infinity;
    for (let k = first; k < spectrumDb.length; k++) {
      if (Math.abs(k - bin) <= 3) continue;
      const v = spectrumDb[k]!;
      if (v > other) other = v;
    }
    if (peak - other < o.dominanceDb) {
      this.history = [];
      return false;
    }

    const last = this.history[this.history.length - 1];
    if (last && Math.abs(last.bin - bin) > 1) this.history = [];
    this.history.push({ bin, db: peak });
    if (this.history.length > o.windowTicks) this.history.shift();
    if (this.history.length < o.windowTicks) return false;

    const grew = this.history[this.history.length - 1]!.db - this.history[0]!.db;
    return grew >= o.growthDb;
  }
}
