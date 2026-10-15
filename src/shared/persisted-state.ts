import { clamp, createDefaultParams, sanitiseParams, type StudioParams } from './params';
import { DEFAULT_PRESET } from './presets';
import {
  createDefaultHotkeys,
  createDefaultProfiles,
  createDefaultSoundOptions,
  type HotkeysState,
  type ProfileApp,
  type ProfilesState,
  type SoundEntry,
  type SoundOptions,
} from './features';
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
  /** raise the buffer automatically when audio starts to drop out */
  autoBuffer: boolean;
  profiles: ProfilesState;
  hotkeys: HotkeysState;
  sounds: SoundEntry[];
  soundOptions: SoundOptions;
  /** the first-run setup wizard was completed or skipped */
  setupDone: boolean;
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
    autoBuffer: true,
    profiles: createDefaultProfiles(),
    hotkeys: createDefaultHotkeys(),
    sounds: [],
    soundOptions: createDefaultSoundOptions(),
    setupDone: false,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length > 0 ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

function readProfiles(raw: unknown): ProfilesState {
  const base = createDefaultProfiles();
  if (!isRecord(raw)) return base;
  const apps: ProfileApp[] = [];
  if (Array.isArray(raw.apps)) {
    for (const a of raw.apps.slice(0, 50)) {
      if (!isRecord(a)) continue;
      const exe = text(a.exe, 120);
      if (!exe) continue;
      apps.push({
        exe: exe.toLowerCase(),
        name: text(a.name, 60) ?? exe,
        preset: text(a.preset, 80),
        start: bool(a.start, false),
      });
    }
  }
  return { enabled: bool(raw.enabled, false), fallback: text(raw.fallback, 80), apps };
}

function readStringMap(raw: unknown, max = 100): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, max)) {
    const v = text(value, 60);
    if (v && key.length <= 80) out[key] = v;
  }
  return out;
}

function readHotkeys(raw: unknown): HotkeysState {
  const base = createDefaultHotkeys();
  if (!isRecord(raw)) return base;
  const quick = isRecord(raw.quick) ? raw.quick : {};
  return {
    voices: readStringMap(raw.voices),
    quick: { preset: text(quick.preset, 80), accelerator: text(quick.accelerator, 60) },
    sounds: readStringMap(raw.sounds),
    toast: bool(raw.toast, true),
  };
}

function readSounds(raw: unknown): SoundEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SoundEntry[] = [];
  for (const s of raw.slice(0, 64)) {
    if (!isRecord(s)) continue;
    const id = text(s.id, 64);
    const name = text(s.name, 60);
    if (id && name && /^[a-z0-9-]+$/i.test(id)) out.push({ id, name });
  }
  return out;
}

function readSoundOptions(raw: unknown): SoundOptions {
  const base = createDefaultSoundOptions();
  if (!isRecord(raw)) return base;
  return { duckVoice: bool(raw.duckVoice, true), volume: clamp(num(raw.volume, base.volume), 0, 100) };
}

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
    autoBuffer: bool(raw.autoBuffer, true),
    profiles: readProfiles(raw.profiles),
    hotkeys: readHotkeys(raw.hotkeys),
    sounds: readSounds(raw.sounds),
    soundOptions: readSoundOptions(raw.soundOptions),
    // anyone who already has stored settings has been through the app before
    setupDone: bool(raw.setupDone, true),
  };

  if (modern && isRecord(raw.params)) {
    state.params = sanitiseParams(raw.params);
  }
  return { state, migrated: !modern };
}
