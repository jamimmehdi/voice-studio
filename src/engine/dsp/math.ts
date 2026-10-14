export const PI = Math.PI;
export const TWO_PI = 2 * Math.PI;

/** dB -> linear amplitude. */
export const dbToLin = (db: number): number => Math.pow(10, db / 20);

/** Linear amplitude -> dB, floored at -180 dB so silence never yields -Infinity. */
export const linToDb = (x: number): number => 20 * Math.log10(x > 1e-9 ? x : 1e-9);

/** One-pole smoothing coefficient for a time constant in milliseconds. */
export const smoothingCoef = (ms: number, sampleRate: number): number =>
  ms <= 0 ? 0 : Math.exp(-1 / (ms * 0.001 * sampleRate));
