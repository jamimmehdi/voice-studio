import type { StudioParams } from './params';

/* ------------------------------------------------------------------ */
/* AudioWorklet <-> engine                                            */
/* ------------------------------------------------------------------ */

export interface MeterSnapshot {
  /** linear peak of the (raw) input since the last snapshot */
  inPeak: number;
  outPeak: number;
  /** gain reduction in dB, 0 or negative */
  exp: number;
  deess: number;
  comp: number;
  lim: number;
}

export type ToWorklet = { type: 'params'; params: StudioParams } | { type: 'record'; on: boolean };

export type FromWorklet =
  | { type: 'ready'; sampleRate: number }
  | ({ type: 'meters'; latency: number; dropouts: number } & MeterSnapshot)
  | { type: 'rec'; data: Float32Array };

/* ------------------------------------------------------------------ */
/* Compact panel / floating icon <-> engine window                    */
/* ------------------------------------------------------------------ */

export interface QuickChip {
  key: string;
  label: string;
}

export interface QuickState {
  running: boolean;
  preset: string | null;
  chips: QuickChip[];
  pitch: number;
  formant: number;
  monitor: boolean;
  bypass: boolean;
  gate: boolean;
  /** 0..1 */
  level: number;
  stats: string;
  music: { has: boolean; title: string; playing: boolean; progress: number };
}

export type QuickCommand =
  | { type: 'toggleEngine' }
  | { type: 'preset'; name: string }
  | { type: 'voice'; pitch?: number; formant?: number }
  | { type: 'monitor' }
  | { type: 'bypass' }
  | { type: 'gate' }
  | { type: 'music' }
  // handled by the main process itself
  | { type: 'openStudio' }
  | { type: 'minimizeToIcon' }
  | { type: 'hideCompact' }
  | { type: 'openCompact' };

export const MAIN_PROCESS_COMMANDS: readonly QuickCommand['type'][] = [
  'openStudio',
  'minimizeToIcon',
  'hideCompact',
  'openCompact',
];
