export const SCOPE_F_MIN = 20;
export const SCOPE_F_MAX = 20000;
/** the EQ curve is drawn across ±22 dB over the full height of the graph */
export const SCOPE_DB_SPAN = 22;
export const SCOPE_BARS = 48;

const LOG_RANGE = Math.log(SCOPE_F_MAX / SCOPE_F_MIN);

export const freqToX = (freq: number, width: number): number => (Math.log(freq / SCOPE_F_MIN) / LOG_RANGE) * width;

export const xToFreq = (x: number, width: number): number => SCOPE_F_MIN * Math.pow(SCOPE_F_MAX / SCOPE_F_MIN, x / width);

/** dB gain -> y pixel (0 dB is the vertical centre). */
export const dbToY = (db: number, height: number): number => height / 2 - (db / SCOPE_DB_SPAN) * (height / 2);

export const yToDb = (y: number, height: number): number => ((height / 2 - y) / (height / 2)) * SCOPE_DB_SPAN;

export interface Handle {
  index: number;
  x: number;
  y: number;
}

/** Nearest handle within `radius` px of the pointer, or null. */
export function hitHandle(handles: readonly Handle[], x: number, y: number, radius = 14): Handle | null {
  let best: Handle | null = null;
  let bestDist = radius * radius;
  for (const h of handles) {
    const d = (h.x - x) ** 2 + (h.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}

/**
 * Collapses an analyser's dB spectrum into `bars` logarithmically spaced levels in 0..1.
 * `binHz` is the width of one analyser bin.
 */
export function spectrumBars(dbData: Float32Array, binHz: number, bars = SCOPE_BARS): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const f0 = SCOPE_F_MIN * Math.pow(SCOPE_F_MAX / SCOPE_F_MIN, i / bars);
    const f1 = SCOPE_F_MIN * Math.pow(SCOPE_F_MAX / SCOPE_F_MIN, (i + 1) / bars);
    const b0 = Math.max(1, Math.floor(f0 / binHz));
    const b1 = Math.min(dbData.length - 1, Math.max(b0, Math.ceil(f1 / binHz)));
    let peak = -120;
    for (let b = b0; b <= b1; b++) if (dbData[b]! > peak) peak = dbData[b]!;
    out.push(Math.max(0, Math.min(1, (peak + 100) / 100)));
  }
  return out;
}

/** Gentle idle shape shown when the engine is off. */
export function idleBars(bars = SCOPE_BARS): number[] {
  return Array.from({ length: bars }, (_, i) => 0.05 + 0.04 * Math.sin(i * 1.7));
}
