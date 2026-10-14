import { clamp, createDefaultParams, mergeDeep, type DeepPartial, type StudioParams } from './params';
import { DEFAULT_PRESET } from './presets';
import { DEFAULT_STAGE, isStageId, type StageId } from './stages';

/** localStorage key. Unchanged from the JavaScript version so existing settings carry over. */
export const STORAGE_KEY = 'voicestudio.v1';
export const USER_PRESETS_KEY = 'voicestudio.presets.v1';
export const CABLE_CHOSEN_KEY = 'voicestudio.cableChosen';
export const PERSIST_VERSION = 2;

export type BufferMode = 'low' | 'balanced' | 'safe';
export const BUFFER_MODES: readonly BufferMode[] = ['low', 'balanced', 'safe'];

export interface DeviceSelection {
  in: string;
  out: string;
  mon: string;
}

export interface MusicSettings {
  vol: number;
  duck: boolean;
  loop: boolean;
  show: boolean;
}

export interface PersistedState {
  v: number;
  params: StudioParams;
  dev: DeviceSelection;
  monitor: { on: boolean; vol: number };
  ns: boolean;
  agc: boolean;
  music: MusicSettings;
  buffer: BufferMode;
  preset: string | null;
  stage: StageId;
  warm: boolean;
}

export function createDefaultPersisted(): PersistedState {
  return {
    v: PERSIST_VERSION,
    params: createDefaultParams(),
    dev: { in: 'default', out: 'default', mon: 'default' },
    monitor: { on: false, vol: 0.8 },
    ns: false,
    agc: false,
    music: { vol: 60, duck: true, loop: false, show: false },
    buffer: 'balanced',
    preset: DEFAULT_PRESET,
    stage: DEFAULT_STAGE,
    warm: false,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length > 0 ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Turns whatever is in storage (current format, an older version, or garbage) into a valid state.
 * Parameter sets written by versions before the 2.0 defaults are dropped, because the gate and
 * voice-quality defaults changed and the old values sounded worse.
 */
export function migratePersisted(raw: unknown): { state: PersistedState; migrated: boolean } {
  const base = createDefaultPersisted();
  if (!isRecord(raw)) return { state: base, migrated: false };

  const dev = isRecord(raw.dev) ? raw.dev : {};
  const monitor = isRecord(raw.monitor) ? raw.monitor : {};
  const music = isRecord(raw.music) ? raw.music : {};
  const modern = raw.v === PERSIST_VERSION;

  const state: PersistedState = {
    ...base,
    dev: { in: str(dev.in, 'default'), out: str(dev.out, 'default'), mon: str(dev.mon, 'default') },
    monitor: { on: bool(monitor.on, false), vol: clamp(num(monitor.vol, 0.8), 0, 1) },
    ns: bool(raw.ns, false),
    agc: bool(raw.agc, false),
    music: {
      vol: clamp(num(music.vol, 60), 0, 100),
      duck: bool(music.duck, true),
      loop: bool(music.loop, false),
      show: bool(music.show, false),
    },
    buffer: BUFFER_MODES.includes(raw.buffer as BufferMode) ? (raw.buffer as BufferMode) : 'balanced',
    preset: typeof raw.preset === 'string' ? raw.preset : raw.preset === null ? null : base.preset,
    stage: isStageId(raw.stage) ? raw.stage : DEFAULT_STAGE,
    warm: bool(raw.warm, false),
  };

  if (modern && isRecord(raw.params)) {
    state.params = mergeDeep(createDefaultParams(), raw.params as DeepPartial<StudioParams>);
  }
  return { state, migrated: !modern };
}
