import type { DisplayMeters } from '@engine/audio/meter-smoother';
import { meterPercent } from '@engine/audio/meter-smoother';
import type { MusicSnapshot } from '@engine/audio/music-player';
import { formatEngineStats } from '@shared/format';
import type { StudioApi } from '@shared/ipc';
import { QUICK_CHIPS } from '@shared/presets';
import type { QuickCommand, QuickState } from '@shared/protocols';
import { linToDb } from '@engine/dsp/math';
import type { StudioState, StudioStoreApi } from '../store/studio-store';

export interface QuickStateInput {
  state: Pick<StudioState, 'params' | 'preset' | 'monitor' | 'engine'>;
  meters: Pick<DisplayMeters, 'inPeak'>;
  music: Pick<MusicSnapshot, 'trackCount' | 'title' | 'playing' | 'progress'>;
  latencyMs: number;
  dropouts: number;
}

/** Snapshot of everything the compact panel and floating icon show. Pure. */
export function buildQuickState(input: QuickStateInput): QuickState {
  const { state, meters, music } = input;
  const running = state.engine === 'running';
  const level = running ? Math.round((meterPercent(linToDb(meters.inPeak)) / 100) * 50) / 50 : 0;
  return {
    running,
    preset: state.preset,
    chips: QUICK_CHIPS.map((c) => ({ ...c })),
    pitch: state.params.voice.pitch,
    formant: state.params.voice.formant,
    monitor: state.monitor.on,
    bypass: state.params.bypass,
    gate: state.params.exp.on,
    level,
    stats: running ? formatEngineStats(input.latencyMs, input.dropouts) : '',
    music: {
      has: music.trackCount > 0,
      title: music.title,
      playing: music.playing,
      progress: Math.round(music.progress * 100) / 100,
    },
  };
}

export interface CommandTargets {
  store: StudioStoreApi;
  toggleEngine(): void;
  toggleMusic(): void;
}

/** Applies a command that arrived from the compact panel / floating icon. */
export function applyQuickCommand(cmd: QuickCommand, t: CommandTargets): void {
  const s = t.store.getState();
  switch (cmd.type) {
    case 'toggleEngine':
      t.toggleEngine();
      break;
    case 'preset':
      s.applyPreset(cmd.name);
      break;
    case 'voice': {
      const patch: { on: true; pitch?: number; formant?: number } = { on: true };
      if (typeof cmd.pitch === 'number') patch.pitch = clampSemitones(cmd.pitch);
      if (typeof cmd.formant === 'number') patch.formant = clampSemitones(cmd.formant);
      s.patchVoice(patch);
      break;
    }
    case 'monitor':
      s.setMonitor({ on: !s.monitor.on });
      break;
    case 'bypass':
      s.setBypass(!s.params.bypass);
      break;
    case 'gate':
      s.toggleModule('exp');
      break;
    case 'music':
      t.toggleMusic();
      break;
    default:
      break; // window commands are handled by the main process
  }
}

const clampSemitones = (v: number): number => Math.max(-12, Math.min(12, Math.round(v * 10) / 10));

export interface BridgeDeps extends CommandTargets {
  api: Pick<StudioApi, 'quick'>;
  getMeters(): Pick<DisplayMeters, 'inPeak'>;
  getMusic(): QuickStateInput['music'];
  getEngineStats(): { latencyMs: number; dropouts: number };
  intervalMs?: number;
}

/**
 * Keeps the compact panel and the floating icon in sync with the engine window.
 * Timer driven (not rAF) so it also works while the studio window is hidden in the tray.
 */
export function startRemoteBridge(deps: BridgeDeps): () => void {
  let last = '';
  const push = (): void => {
    const { latencyMs, dropouts } = deps.getEngineStats();
    const state = buildQuickState({
      state: deps.store.getState(),
      meters: deps.getMeters(),
      music: deps.getMusic(),
      latencyMs,
      dropouts,
    });
    const json = JSON.stringify(state);
    if (json === last) return;
    last = json;
    deps.api.quick.pushState(state);
  };

  const timer = setInterval(push, deps.intervalMs ?? 100);
  const off = deps.api.quick.onCommand((cmd) => {
    applyQuickCommand(cmd, deps);
    push();
  });
  push();

  return () => {
    clearInterval(timer);
    off();
  };
}
