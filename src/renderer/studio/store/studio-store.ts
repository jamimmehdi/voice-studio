import { createStore, type StoreApi } from 'zustand/vanilla';
import type { DeviceLists } from '@engine/audio/devices';
import {
  cloneParams,
  clamp,
  createDefaultParams,
  type EqBand,
  type ModuleKey,
  type StudioParams,
  type VoiceParams,
} from '@shared/params';
import {
  createDefaultPersisted,
  type BufferMode,
  type DeviceSelection,
  type MusicSettings,
  type PersistedState,
} from '@shared/persisted-state';
import { applyBuiltinPreset, applyUserPreset } from '@shared/presets';
import type { StageId } from '@shared/stages';
import type { UpdateInfo } from '@shared/ipc';

export type EngineStatus = 'stopped' | 'starting' | 'running';
export type ModalId = 'about' | 'guide' | 'cable' | 'save-preset';

export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'available'; info: UpdateInfo }
  | { phase: 'downloading'; percent: number }
  | { phase: 'restarting' }
  | { phase: 'failed'; message: string; info: UpdateInfo | null };

/** EQ "warmer tone" quick fix: how much the low shelf is raised. */
export const WARM_BOOST_DB = 3;

export interface StudioState {
  // ---- persisted ----
  params: StudioParams;
  /** name of the active preset, or null once the settings were edited ("custom") */
  preset: string | null;
  stage: StageId;
  warm: boolean;
  dev: DeviceSelection;
  monitor: { on: boolean; vol: number };
  ns: boolean;
  agc: boolean;
  buffer: BufferMode;
  music: MusicSettings;
  userPresets: Record<string, StudioParams>;

  // ---- session only ----
  engine: EngineStatus;
  status: string;
  devices: DeviceLists;
  modal: ModalId | null;
  update: UpdateStatus;
  recording: boolean;
  /** the stored settings came from an older version and were reset to the new defaults */
  migrated: boolean;
}

export interface StudioActions {
  setStage(stage: StageId): void;

  // parameters
  patchVoice(patch: Partial<VoiceParams>, opts?: { custom?: boolean }): void;
  patchModule<K extends Exclude<ModuleKey, 'eq' | 'voice'>>(key: K, patch: Partial<StudioParams[K]>): void;
  setEqBand(index: number, patch: Partial<EqBand>): void;
  setEqOn(on: boolean): void;
  toggleModule(key: ModuleKey): void;
  setGain(which: 'inGain' | 'outGain', db: number): void;
  setBypass(on: boolean): void;
  setWarm(on: boolean): void;

  // presets
  applyPreset(name: string): boolean;
  saveUserPreset(name: string): void;
  deleteUserPreset(name: string): void;

  // devices & monitor
  setDevice(kind: keyof DeviceSelection, id: string): void;
  setMonitor(patch: Partial<StudioState['monitor']>): void;
  setNoiseSuppression(on: boolean): void;
  setAutoGain(on: boolean): void;
  setBuffer(mode: BufferMode): void;
  setDeviceLists(lists: DeviceLists): void;

  // music
  setMusic(patch: Partial<MusicSettings>): void;

  // session
  setEngine(status: EngineStatus): void;
  setStatus(message: string): void;
  setModal(modal: ModalId | null): void;
  setUpdate(update: UpdateStatus): void;
  setRecording(on: boolean): void;
}

export type StudioStore = StudioState & StudioActions;
export type StudioStoreApi = StoreApi<StudioStore>;

export interface StoreSeed {
  persisted?: PersistedState;
  userPresets?: Record<string, StudioParams>;
  migrated?: boolean;
}

const EMPTY_DEVICES: DeviceLists = { inputs: [], outputs: [], hasLabels: false };

/** Creates a store instance (one per window; tests create their own). */
export function createStudioStore(seed: StoreSeed = {}): StudioStoreApi {
  const p = seed.persisted ?? createDefaultPersisted();

  return createStore<StudioStore>()((set, get) => {
    /** Applies `fn` to a deep copy of the params and stores the result. */
    const editParams = (fn: (draft: StudioParams) => void, custom: boolean): void => {
      const draft = cloneParams(get().params);
      fn(draft);
      set(custom ? { params: draft, preset: null } : { params: draft });
    };

    return {
      params: p.params,
      preset: p.preset,
      stage: p.stage,
      warm: p.warm,
      dev: p.dev,
      monitor: p.monitor,
      ns: p.ns,
      agc: p.agc,
      buffer: p.buffer,
      music: p.music,
      userPresets: seed.userPresets ?? {},

      engine: 'stopped',
      status: 'VB-CABLE by VB-Audio · yt-dlp',
      devices: EMPTY_DEVICES,
      modal: null,
      update: { phase: 'idle' },
      recording: false,
      migrated: seed.migrated ?? false,

      setStage: (stage) => set({ stage }),

      patchVoice: (patch, opts) => editParams((d) => Object.assign(d.voice, patch), opts?.custom ?? true),

      patchModule: (key, patch) => editParams((d) => Object.assign(d[key], patch), true),

      setEqBand: (index, patch) =>
        editParams((d) => {
          const band = d.eq.bands[index];
          if (band) Object.assign(band, patch);
        }, true),

      setEqOn: (on) =>
        editParams((d) => {
          d.eq.on = on;
        }, false),

      toggleModule: (key) =>
        editParams((d) => {
          d[key].on = !d[key].on;
        }, false),

      setGain: (which, db) =>
        editParams((d) => {
          d[which] = clamp(Math.round(db * 10) / 10, -24, 24);
        }, false),

      setBypass: (on) =>
        editParams((d) => {
          d.bypass = on;
        }, false),

      setWarm: (on) => {
        if (get().warm === on) return;
        editParams((d) => {
          const low = d.eq.bands[0];
          low.gain = clamp(low.gain + (on ? WARM_BOOST_DB : -WARM_BOOST_DB), -18, 18);
        }, true);
        set({ warm: on });
      },

      applyPreset: (name) => {
        const state = get();
        const saved = state.userPresets[name];
        const next = saved ? applyUserPreset(saved) : applyBuiltinPreset(state.params, name);
        if (!next) return false;
        set({ params: next, preset: name, warm: false });
        return true;
      },

      saveUserPreset: (name) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({ userPresets: { ...s.userPresets, [clean]: cloneParams(s.params) }, preset: clean }));
      },

      deleteUserPreset: (name) =>
        set((s) => {
          const { [name]: _removed, ...rest } = s.userPresets;
          return { userPresets: rest, preset: s.preset === name ? null : s.preset };
        }),

      setDevice: (kind, id) => set((s) => ({ dev: { ...s.dev, [kind]: id } })),
      setMonitor: (patch) => set((s) => ({ monitor: { ...s.monitor, ...patch } })),
      setNoiseSuppression: (ns) => set({ ns }),
      setAutoGain: (agc) => set({ agc }),
      setBuffer: (buffer) => set({ buffer }),
      setDeviceLists: (devices) => set({ devices }),

      setMusic: (patch) => set((s) => ({ music: { ...s.music, ...patch } })),

      setEngine: (engine) => set({ engine }),
      setStatus: (status) => set({ status }),
      setModal: (modal) => set({ modal }),
      setUpdate: (update) => set({ update }),
      setRecording: (recording) => set({ recording }),
    };
  });
}

/** The subset of the state that is written to localStorage. */
export function toPersisted(s: StudioState): PersistedState {
  return {
    v: createDefaultPersisted().v,
    params: s.params,
    dev: s.dev,
    monitor: s.monitor,
    ns: s.ns,
    agc: s.agc,
    music: s.music,
    buffer: s.buffer,
    preset: s.preset,
    stage: s.stage,
    warm: s.warm,
  };
}

export { createDefaultParams };
