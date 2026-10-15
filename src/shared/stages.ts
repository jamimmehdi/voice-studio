import type { ModuleKey } from './params';

/** The stages of the signal chain, left to right. */
export type StageId =
  'mic' | 'hpf' | 'noise' | 'exp' | 'voice' | 'deess' | 'breath' | 'eq' | 'fx' | 'comp' | 'lim' | 'out';

export interface StageDef {
  id: StageId;
  name: string;
  /** small caps tag above the name */
  group: string;
  /** shorter name for the narrow chain tiles */
  short?: string;
  /** which params section the on/off switch controls (none for mic / output) */
  module?: ModuleKey;
  /** which gain-reduction meter belongs to this stage */
  meter?: 'exp' | 'deess' | 'comp' | 'lim';
}

export const STAGES: readonly StageDef[] = [
  { id: 'mic', name: 'Mic', group: 'In' },
  { id: 'hpf', name: 'High-pass', group: 'Clean', module: 'hpf' },
  { id: 'noise', name: 'Noise removal', short: 'Noise', group: 'Clean', module: 'noise' },
  { id: 'exp', name: 'Gate', group: 'Clean', module: 'exp', meter: 'exp' },
  { id: 'voice', name: 'Voice', group: 'Voice', module: 'voice' },
  { id: 'deess', name: 'De-esser', group: 'Tone', module: 'deess', meter: 'deess' },
  { id: 'breath', name: 'Breath & clicks', short: 'Breath', group: 'Tone', module: 'breath' },
  { id: 'eq', name: 'EQ', group: 'Tone', module: 'eq' },
  { id: 'fx', name: 'Effects', group: 'Space', module: 'fx' },
  { id: 'comp', name: 'Compressor', group: 'Dynamics', module: 'comp', meter: 'comp' },
  { id: 'lim', name: 'Limiter', group: 'Dynamics', module: 'lim', meter: 'lim' },
  { id: 'out', name: 'Output', group: 'Out' },
];

export const DEFAULT_STAGE: StageId = 'voice';

export function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && STAGES.some((s) => s.id === value);
}

export const STAGE_INFO: Readonly<Record<StageId, { title: string; description: string }>> = {
  mic: {
    title: 'Microphone',
    description: 'Where your voice comes in. Speak normally: the IN meter should peak around −12 dB.',
  },
  hpf: {
    title: 'High-pass filter',
    description: 'Removes rumble, desk bumps and breath plosives below the cut-off.',
  },
  breath: {
    title: 'Breath & clicks',
    description: 'Softens mouth clicks and loud breaths, which pitch shifting exaggerates.',
  },
  noise: {
    title: 'Noise removal',
    description: 'Removes fans, keyboards and room hum, even while you talk.',
  },
  fx: {
    title: 'Effects',
    description: 'Radio, megaphone and walkie-talkie voices, plus reverb, echo and chorus.',
  },
  exp: {
    title: 'Gate (downward expander)',
    description: 'Quietens the mic between words so room noise and keyboard clicks disappear.',
  },
  voice: { title: 'Voice', description: 'Drag the dot to move between male, female and cartoon voices.' },
  deess: {
    title: 'De-esser',
    description: 'Softens harsh “S” and “T” sounds, which pitch-shifting tends to exaggerate.',
  },
  eq: {
    title: 'Parametric EQ',
    description: 'Six bands. Drag the numbered dots in the Live output graph, or use the knobs.',
  },
  comp: {
    title: 'Compressor',
    description: 'Evens out loud and soft parts so teammates hear you at a steady level.',
  },
  lim: {
    title: 'Limiter',
    description: 'A brick wall that stops shouting from clipping or blasting your teammates.',
  },
  out: {
    title: 'Output',
    description: 'What leaves Voice Studio. Pick CABLE Output as the microphone in your game.',
  },
};
