import {
  cloneParams,
  createDefaultParams,
  mergeDeep,
  type BandType,
  type DeepPartial,
  type EqBand,
  type EqBands,
  type StudioParams,
} from './params';

/** Name of a built-in or user preset. */
export type PresetName = string;

type BandSpec = readonly [freq: number, gain: number, q: number];

const band = (type: BandType, [freq, gain, q]: BandSpec): EqBand => ({ type, freq, gain, q, on: true });

/** Six-band EQ in the studio's fixed topology: low shelf, four bells, high shelf. */
export function eqBands(
  low: BandSpec,
  p1: BandSpec,
  p2: BandSpec,
  p3: BandSpec,
  p4: BandSpec,
  high: BandSpec,
): EqBands {
  return [
    band('lowshelf', low),
    band('peaking', p1),
    band('peaking', p2),
    band('peaking', p3),
    band('peaking', p4),
    band('highshelf', high),
  ];
}

export type PresetPatch = DeepPartial<StudioParams>;

/** Display/ordering metadata for the voice tiles. */
export interface VoiceTile {
  key: PresetName;
  label: string;
  color: string;
}

export const BUILTIN_PRESETS: Readonly<Record<PresetName, PresetPatch>> = {
  'Clean mic (no voice change)': {
    voice: { on: false, pitch: 0, formant: 0 },
    eq: {
      bands: eqBands(
        [120, 0, 0.7],
        [300, -1.5, 1],
        [1000, 0, 1],
        [3000, 1.5, 1],
        [6000, 0, 1],
        [10000, 1.5, 0.7],
      ),
    },
  },
  'Female – Natural': {
    voice: { on: true, pitch: 4.5, formant: 2.8, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [150, -3, 0.7],
        [320, -2, 1.1],
        [1100, 0, 1],
        [3200, 2, 1],
        [6000, 0, 1],
        [9500, 2.5, 0.7],
      ),
    },
  },
  'Female – Soft / Warm': {
    voice: { on: true, pitch: 4, formant: 2.2, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [160, -1.5, 0.7],
        [250, 1, 1],
        [1000, 0, 1],
        [3500, 0.5, 1],
        [6500, -1.5, 1],
        [9000, 1, 0.7],
      ),
    },
  },
  'Female – Bright / Young': {
    voice: { on: true, pitch: 6.5, formant: 4, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [180, -4, 0.7],
        [350, -2, 1.1],
        [1200, 1, 1],
        [3500, 2.5, 1],
        [6500, 1, 1],
        [10000, 3, 0.7],
      ),
    },
  },
  'Girl / Child': {
    voice: { on: true, pitch: 9, formant: 6, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [200, -5, 0.7],
        [400, -2, 1.1],
        [1400, 1.5, 1],
        [3800, 3, 1],
        [7000, 1, 1],
        [10000, 3, 0.7],
      ),
    },
  },
  'Male – Deep': {
    voice: { on: true, pitch: -4, formant: -2.5, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [110, 3, 0.7],
        [250, 1.5, 1],
        [1000, 0, 1],
        [3000, -1, 1],
        [6000, -1.5, 1],
        [10000, -2, 0.7],
      ),
    },
  },
  'Male – Strong / Very Manly': {
    voice: { on: true, pitch: -5.5, formant: -3.5, mix: 100, robot: false },
    eq: {
      bands: eqBands(
        [95, 4.5, 0.7],
        [220, 2.5, 1],
        [900, -1, 1],
        [2800, 1, 1],
        [6000, -2, 1],
        [10000, -3, 0.7],
      ),
    },
    comp: { thresh: -26, ratio: 4, attack: 6, release: 140, knee: 6, makeup: 6, mix: 100 },
    deess: { thresh: -34, ratio: 5 },
  },
  'Cartoon / Chipmunk': {
    voice: { on: true, pitch: 11, formant: 8, mix: 100, robot: false },
    eq: {
      bands: eqBands([200, -6, 0.7], [500, 0, 1], [1500, 2, 1], [4000, 3, 1], [7000, 1, 1], [10000, 2, 0.7]),
    },
  },
  'Giant / Monster': {
    voice: { on: true, pitch: -9, formant: -6, mix: 100, robot: false },
    eq: {
      bands: eqBands([90, 5, 0.7], [200, 3, 1], [900, 0, 1], [3000, -3, 1], [6000, -4, 1], [10000, -6, 0.7]),
    },
  },
  Robot: {
    voice: { on: true, pitch: -2, formant: 0, mix: 100, robot: true, robotFreq: 55, robotMix: 100 },
    eq: {
      bands: eqBands([120, 0, 0.7], [300, 0, 1], [1000, 2, 1], [3000, 3, 1], [6000, 0, 1], [10000, 0, 0.7]),
    },
  },
  'Broadcast voice (male)': {
    voice: { on: false },
    eq: {
      bands: eqBands(
        [100, 2.5, 0.7],
        [250, -1.5, 1],
        [1000, 0, 1],
        [3500, 2.5, 1],
        [6500, -1, 1],
        [11000, 2, 0.7],
      ),
    },
    comp: { thresh: -24, ratio: 4, attack: 6, release: 140, knee: 6, makeup: 6, mix: 100 },
  },
};

export const BUILTIN_PRESET_NAMES: readonly PresetName[] = Object.keys(BUILTIN_PRESETS);

/** Voice tiles in the order and with the colours of the design board. */
export const VOICE_TILES: readonly VoiceTile[] = [
  { key: 'Female – Natural', label: 'Female – Natural', color: '#ff7ac8' },
  { key: 'Female – Soft / Warm', label: 'Female – Soft', color: '#ff7ac8' },
  { key: 'Female – Bright / Young', label: 'Female – Bright', color: '#ff7ac8' },
  { key: 'Girl / Child', label: 'Girl / Child', color: '#ffb86b' },
  { key: 'Male – Deep', label: 'Male – Deep', color: '#6aa8ff' },
  { key: 'Male – Strong / Very Manly', label: 'Male – Strong', color: '#6aa8ff' },
  { key: 'Cartoon / Chipmunk', label: 'Cartoon', color: '#ffd86b' },
  { key: 'Giant / Monster', label: 'Giant', color: '#8f7bff' },
  { key: 'Robot', label: 'Robot', color: '#9aa6b8' },
  { key: 'Clean mic (no voice change)', label: 'Clean mic', color: '#5eead4' },
];

/** Chips shown in the compact panel (no "Clean mic" there). */
export const QUICK_CHIPS: readonly { key: PresetName; label: string }[] = VOICE_TILES.filter(
  (t) => t.key !== 'Clean mic (no voice change)' && t.key !== 'Female – Bright / Young',
).map(({ key, label }) => ({ key, label }));

/** Positions of preset landmarks drawn on the voice pad. */
export const PAD_LANDMARKS: readonly { label: string; pitch: number; formant: number }[] = [
  { label: 'Giant', pitch: -9, formant: -6 },
  { label: 'Male strong', pitch: -5.5, formant: -3.5 },
  { label: 'Male deep', pitch: -4, formant: -2.5 },
  { label: 'Robot', pitch: -2, formant: 0 },
  { label: 'Female soft', pitch: 4, formant: 2.2 },
  { label: 'Girl', pitch: 9, formant: 6 },
  { label: 'Cartoon', pitch: 11, formant: 8 },
];

export const DEFAULT_PRESET: PresetName = 'Female – Natural';

/**
 * Applies a built-in preset on top of the user's current setup.
 * The "studio chain" settings the user tuned (HPF, gate, de-esser, compressor, limiter, gains)
 * are kept, only the voice / EQ (and any chain overrides the preset itself defines) change.
 */
export function applyBuiltinPreset(current: StudioParams, name: PresetName): StudioParams | null {
  const patch = BUILTIN_PRESETS[name];
  if (!patch) return null;
  const base = createDefaultParams();
  const keep = {
    inGain: current.inGain,
    outGain: current.outGain,
    hpf: current.hpf,
    noise: current.noise,
    breath: current.breath,
    fx: current.fx,
    exp: current.exp,
    deess: current.deess,
    comp: current.comp,
    lim: current.lim,
  };
  const merged = mergeDeep(mergeDeep(base, cloneParams(keep)), patch);
  merged.voice.quality = current.voice.quality;
  merged.bypass = false;
  return merged;
}

/** A saved user preset is a complete parameter set; it restores everything except bypass. */
export function applyUserPreset(saved: StudioParams): StudioParams {
  const merged = mergeDeep(createDefaultParams(), cloneParams(saved));
  merged.bypass = false;
  return merged;
}
