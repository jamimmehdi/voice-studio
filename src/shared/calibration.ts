/**
 * Pure helpers behind the setup wizard, "Find my voice" and the diagnostics:
 * level maths, noise-floor statistics and pitch detection. No browser or Electron dependencies.
 */

export const dbFromLinear = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));

export function rmsOf(samples: Float32Array, from = 0, to = samples.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += samples[i]! * samples[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Block RMS values in dB. */
export function blockLevelsDb(samples: Float32Array, block: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + block <= samples.length; i += block)
    out.push(dbFromLinear(rmsOf(samples, i, i + block)));
  return out;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return -120;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}

export interface LevelStats {
  /** loud speech level (95th percentile of block levels) */
  speechDb: number;
  /** background level (10th percentile) */
  noiseDb: number;
}

export function levelStats(blocksDb: readonly number[]): LevelStats {
  const sorted = [...blocksDb].sort((a, b) => a - b);
  return { speechDb: percentile(sorted, 0.95), noiseDb: percentile(sorted, 0.1) };
}

/** Wanted loud-speech level of the microphone signal before the chain. */
export const TARGET_SPEECH_DB = -14;

/** Input gain (dB) that brings loud speech to the target level, limited to a sane range. */
export function suggestInputGain(speechDb: number): number {
  const gain = TARGET_SPEECH_DB - speechDb;
  return Math.round(Math.min(18, Math.max(-12, gain)) * 2) / 2;
}

/** Gate threshold: a little above the noise floor, never so high it clips quiet speech. */
export function suggestGateThreshold(noiseDb: number, speechDb: number): number {
  const wanted = noiseDb + 8;
  const ceiling = speechDb - 20;
  return Math.round(Math.min(-35, Math.max(-75, Math.min(wanted, ceiling))));
}

export type NoiseVerdict = 'quiet' | 'hum' | 'noisy';

export function describeNoise(noiseDb: number): { verdict: NoiseVerdict; label: string } {
  if (noiseDb < -58) return { verdict: 'quiet', label: 'very quiet room' };
  if (noiseDb < -46) return { verdict: 'hum', label: 'a little hum' };
  return { verdict: 'noisy', label: 'noticeably noisy' };
}

export type NoiseLevel = 'Light' | 'Medium' | 'Strong';

export function suggestNoiseLevel(noiseDb: number): NoiseLevel {
  if (noiseDb < -58) return 'Light';
  if (noiseDb < -46) return 'Medium';
  return 'Strong';
}

export const NOISE_LEVEL_AMOUNT: Record<NoiseLevel, number> = { Light: 40, Medium: 70, Strong: 90 };

/** Which of the three buttons matches `amount` exactly, if any. */
export function noiseLevelFor(amount: number): NoiseLevel | null {
  for (const level of ['Light', 'Medium', 'Strong'] as const) {
    if (NOISE_LEVEL_AMOUNT[level] === amount) return level;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* pitch                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fundamental frequency of one voiced frame by normalised autocorrelation, or null when the frame
 * is unvoiced / too quiet. Searches 70..400 Hz.
 */
export function detectPitchFrame(frame: Float32Array, sampleRate: number): number | null {
  const n = frame.length;
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 70));
  let energy = 0;
  for (let i = 0; i < n; i++) energy += frame[i]! * frame[i]!;
  if (energy / n < 1e-6) return null;

  let bestLag = -1;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += frame[i]! * frame[i + lag]!;
    const norm = sum / energy;
    if (norm > best) {
      best = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.45) return null;
  return sampleRate / bestLag;
}

/** Median pitch of a recording, or null when there was no clear voiced speech. */
export function estimatePitch(samples: Float32Array, sampleRate: number): number | null {
  const frameLen = Math.round(sampleRate * 0.04);
  const hop = Math.round(sampleRate * 0.02);
  const found: number[] = [];
  for (let start = 0; start + frameLen <= samples.length; start += hop) {
    const f = detectPitchFrame(samples.subarray(start, start + frameLen), sampleRate);
    if (f !== null) found.push(f);
  }
  if (found.length < 8) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)]!;
}

const FEMALE_TARGET_HZ = 158;

export interface VoiceSuggestion {
  pitch: number;
  formant: number;
}

/** Pitch / formant (semitones) that turn a voice with fundamental `f0` into a natural female voice. */
export function suggestFemaleVoice(f0: number): VoiceSuggestion {
  const pitch = Math.min(12, Math.max(-12, Math.round(12 * Math.log2(FEMALE_TARGET_HZ / f0) * 2) / 2));
  const formant = Math.min(12, Math.max(-12, Math.round(pitch * 0.6 * 2) / 2));
  return { pitch, formant };
}
