/**
 * The complete, serialisable description of the studio's signal chain.
 * Shared by the audio engine (worklet), the renderer UI, presets and persistence.
 */

export type Quality = 512 | 1024 | 2048;
export type HpfSlope = 12 | 24;
export type DeEsserMode = 0 | 1; // 0 = split-band, 1 = wide-band
export type BandType = 'lowshelf' | 'peaking' | 'highshelf';

export interface VoiceParams {
  on: boolean;
  /** semitones */
  pitch: number;
  /** semitones (formant / throat size) */
  formant: number;
  /** 0..100 wet amount */
  mix: number;
  quality: Quality;
  robot: boolean;
  robotFreq: number;
  robotMix: number;
}

export interface HpfParams {
  on: boolean;
  freq: number;
  slope: HpfSlope;
}

export interface ExpanderParams {
  on: boolean;
  thresh: number;
  ratio: number;
  attack: number;
  release: number;
  hold: number;
  range: number;
}

export interface DeEsserParams {
  on: boolean;
  freq: number;
  q: number;
  thresh: number;
  ratio: number;
  range: number;
  mode: DeEsserMode;
  listen: boolean;
}

export interface EqBand {
  type: BandType;
  freq: number;
  gain: number;
  q: number;
  on: boolean;
}

export const EQ_BAND_COUNT = 6;
export type EqBands = [EqBand, EqBand, EqBand, EqBand, EqBand, EqBand];

export interface EqParams {
  on: boolean;
  bands: EqBands;
}

export interface CompressorParams {
  on: boolean;
  thresh: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  makeup: number;
  mix: number;
}

export interface LimiterParams {
  on: boolean;
  ceiling: number;
  release: number;
}

export interface StudioParams {
  bypass: boolean;
  /** dB */
  inGain: number;
  /** dB */
  outGain: number;
  voice: VoiceParams;
  hpf: HpfParams;
  exp: ExpanderParams;
  deess: DeEsserParams;
  eq: EqParams;
  comp: CompressorParams;
  lim: LimiterParams;
}

/** Keys of the sub-sections that have an `on` switch. */
export type ModuleKey = 'voice' | 'hpf' | 'exp' | 'deess' | 'eq' | 'comp' | 'lim';
export const MODULE_KEYS: readonly ModuleKey[] = ['voice', 'hpf', 'exp', 'deess', 'eq', 'comp', 'lim'];

export const QUALITY_OPTIONS: readonly Quality[] = [512, 1024, 2048];

export function createDefaultParams(): StudioParams {
  return {
    bypass: false,
    inGain: 0,
    outGain: 0,
    voice: { on: true, pitch: 0, formant: 0, mix: 100, quality: 2048, robot: false, robotFreq: 60, robotMix: 100 },
    hpf: { on: true, freq: 80, slope: 24 },
    exp: { on: true, thresh: -58, ratio: 2, attack: 3, release: 200, hold: 80, range: 18 },
    deess: { on: true, freq: 6500, q: 1.2, thresh: -32, ratio: 4, range: 12, mode: 0, listen: false },
    eq: {
      on: true,
      bands: [
        { type: 'lowshelf', freq: 120, gain: 0, q: 0.7, on: true },
        { type: 'peaking', freq: 300, gain: 0, q: 1.0, on: true },
        { type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { type: 'peaking', freq: 3000, gain: 0, q: 1.0, on: true },
        { type: 'peaking', freq: 6000, gain: 0, q: 1.0, on: true },
        { type: 'highshelf', freq: 10000, gain: 0, q: 0.7, on: true },
      ],
    },
    comp: { on: true, thresh: -20, ratio: 3, attack: 8, release: 120, knee: 6, makeup: 3, mix: 100 },
    lim: { on: true, ceiling: -1, release: 80 },
  };
}

/** Recursive partial used for preset patches and persisted-state migration. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep clone for JSON-compatible values. */
export function cloneParams<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Returns a NEW object: `base` with `patch` merged in. Arrays are replaced wholesale
 * (an EQ band list is always a complete set), nested objects merge recursively.
 */
export function mergeDeep<T extends object>(base: T, patch: DeepPartial<T> | undefined): T {
  const out: Record<string, unknown> = cloneParams(base) as Record<string, unknown>;
  if (!patch) return out as T;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    if (Array.isArray(value)) out[key] = cloneParams(value);
    else if (isPlainObject(value) && isPlainObject(current)) out[key] = mergeDeep(current, value);
    else if (isPlainObject(value)) out[key] = cloneParams(value);
    else out[key] = value;
  }
  return out as T;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
