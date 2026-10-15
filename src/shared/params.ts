/**
 * The complete, serialisable description of the studio's signal chain.
 * Shared by the audio engine (worklet), the renderer UI, presets and persistence.
 */

export type Quality = 512 | 1024 | 2048 | 4096;
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

export interface NoiseParams {
  on: boolean;
  /** 0..100 – how much of the detected noise is removed */
  amount: number;
}

export type FxCharacter = 'none' | 'radio' | 'megaphone' | 'walkie' | 'cave';
export const FX_CHARACTERS: readonly FxCharacter[] = ['none', 'radio', 'megaphone', 'walkie', 'cave'];

export interface FxParams {
  on: boolean;
  character: FxCharacter;
  /** 0..100 */
  reverb: number;
  echo: number;
  chorus: number;
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

/** Softens mouth clicks and loud breaths. */
export interface BreathParams {
  on: boolean;
  /** 0..100 click reduction */
  clicks: number;
  /** 0..100 breath reduction */
  breath: number;
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
  noise: NoiseParams;
  exp: ExpanderParams;
  deess: DeEsserParams;
  breath: BreathParams;
  eq: EqParams;
  fx: FxParams;
  comp: CompressorParams;
  lim: LimiterParams;
}

/** Keys of the sub-sections that have an `on` switch. */
export type ModuleKey = 'voice' | 'hpf' | 'noise' | 'exp' | 'deess' | 'breath' | 'eq' | 'fx' | 'comp' | 'lim';
export const MODULE_KEYS: readonly ModuleKey[] = [
  'voice',
  'hpf',
  'noise',
  'exp',
  'deess',
  'breath',
  'eq',
  'fx',
  'comp',
  'lim',
];

export const QUALITY_OPTIONS: readonly Quality[] = [512, 1024, 2048, 4096];

export function createDefaultParams(): StudioParams {
  return {
    bypass: false,
    inGain: 0,
    outGain: 0,
    voice: {
      on: true,
      pitch: 0,
      formant: 0,
      mix: 100,
      quality: 2048,
      robot: false,
      robotFreq: 60,
      robotMix: 100,
    },
    hpf: { on: true, freq: 80, slope: 24 },
    noise: { on: false, amount: 70 },
    exp: { on: true, thresh: -58, ratio: 2, attack: 3, release: 200, hold: 80, range: 18 },
    deess: { on: true, freq: 6500, q: 1.2, thresh: -32, ratio: 4, range: 12, mode: 0, listen: false },
    breath: { on: false, clicks: 60, breath: 50 },
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
    fx: { on: false, character: 'none', reverb: 12, echo: 0, chorus: 0 },
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

/* ------------------------------------------------------------------ */
/* sanitising untrusted parameter sets (imported files, storage)      */
/* ------------------------------------------------------------------ */

/** Inclusive ranges the UI allows; anything outside is pulled back in. */
const RANGES: Record<string, readonly [number, number]> = {
  inGain: [-24, 24],
  outGain: [-24, 24],
  'voice.pitch': [-12, 12],
  'voice.formant': [-12, 12],
  'voice.mix': [0, 100],
  'voice.robotFreq': [20, 400],
  'voice.robotMix': [0, 100],
  'hpf.freq': [20, 500],
  'noise.amount': [0, 100],
  'exp.thresh': [-80, -10],
  'exp.ratio': [1, 10],
  'exp.attack': [0.1, 50],
  'exp.release': [10, 1000],
  'exp.hold': [0, 300],
  'exp.range': [0, 80],
  'deess.freq': [2000, 12000],
  'deess.q': [0.4, 4],
  'deess.thresh': [-60, -5],
  'deess.ratio': [1, 10],
  'deess.range': [0, 30],
  'comp.thresh': [-60, 0],
  'comp.ratio': [1, 20],
  'comp.attack': [0.1, 100],
  'comp.release': [10, 1000],
  'comp.knee': [0, 24],
  'comp.makeup': [0, 24],
  'comp.mix': [0, 100],
  'lim.ceiling': [-12, 0],
  'lim.release': [5, 500],
  'breath.clicks': [0, 100],
  'breath.breath': [0, 100],
  'fx.reverb': [0, 100],
  'fx.echo': [0, 100],
  'fx.chorus': [0, 100],
};

const EQ_RANGES: Record<string, readonly [number, number]> = {
  freq: [20, 20000],
  gain: [-18, 18],
  q: [0.3, 10],
};

function pickKnown(template: unknown, value: unknown, path: string): unknown {
  if (Array.isArray(template)) {
    const list = Array.isArray(value) ? value : [];
    return template.map((t, i) => pickKnown(t, list[i], path));
  }
  if (isPlainObject(template)) {
    const source = isPlainObject(value) ? value : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(template)) {
      out[key] = pickKnown(template[key], source[key], path ? `${path}.${key}` : key);
    }
    return out;
  }
  if (typeof template === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return template;
    const range =
      RANGES[path] ?? (path.startsWith('eq.bands') ? EQ_RANGES[path.split('.').pop()!] : undefined);
    return range ? clamp(value, range[0], range[1]) : value;
  }
  if (typeof template === 'boolean') return typeof value === 'boolean' ? value : template;
  if (typeof template === 'string') return typeof value === 'string' ? value : template;
  return template;
}

const QUALITIES: readonly number[] = QUALITY_OPTIONS;
const BAND_TYPES: readonly string[] = ['lowshelf', 'peaking', 'highshelf'];

/**
 * Turns anything (an imported .vsp, a hand-edited settings file) into a complete, valid parameter
 * set: unknown keys dropped, wrong types replaced by defaults, numbers clamped to the UI ranges.
 */
export function sanitiseParams(raw: unknown): StudioParams {
  const defaults = createDefaultParams();
  const merged = isPlainObject(raw) ? mergeDeep(defaults, raw as DeepPartial<StudioParams>) : defaults;
  const clean = pickKnown(defaults, merged, '') as StudioParams;
  if (!QUALITIES.includes(clean.voice.quality)) clean.voice.quality = defaults.voice.quality;
  clean.hpf.slope = clean.hpf.slope === 12 ? 12 : 24;
  clean.deess.mode = clean.deess.mode === 1 ? 1 : 0;
  if (!FX_CHARACTERS.includes(clean.fx.character)) clean.fx.character = 'none';
  clean.eq.bands.forEach((band, i) => {
    if (!BAND_TYPES.includes(band.type)) band.type = defaults.eq.bands[i]!.type;
  });
  return clean;
}
