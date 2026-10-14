import type { AudioEngine, LatencyHint } from '@engine/audio/audio-engine';
import { findVirtualCable, listDevices } from '@engine/audio/devices';
import { DuckController } from '@engine/audio/ducking';
import type { MusicPlayer } from '@engine/audio/music-player';
import { mimeForExtension } from '@engine/audio/music-player';
import { encodeWav16Mono, recordingFileName } from '@engine/audio/wav';
import type { StudioApi } from '@shared/ipc';
import { CABLE_CHOSEN_KEY, type BufferMode } from '@shared/persisted-state';
import type { KeyValueStorage } from '../store/persistence';
import type { StudioStoreApi } from '../store/studio-store';
import type { MeterHub } from './meter-hub';

type EnginePort = Pick<
  AudioEngine,
  | 'start'
  | 'stop'
  | 'running'
  | 'setParams'
  | 'setMonitor'
  | 'setMonitorDevice'
  | 'setOutputDevice'
  | 'startRecording'
  | 'stopRecording'
  | 'musicBus'
  | 'meters'
  | 'latencyMs'
  | 'events'
  | 'isRecording'
  | 'context'
>;
type PlayerPort = Pick<MusicPlayer, 'addBuffer' | 'pause' | 'loop'>;
type ApiPort = Pick<StudioApi, 'dspSource' | 'ytFetch' | 'saveFile' | 'installVbCable'>;

export interface ControllerDeps {
  store: StudioStoreApi;
  engine: EnginePort;
  player: PlayerPort;
  api: ApiPort;
  storage: KeyValueStorage;
  hub: Pick<MeterHub, 'latest' | 'subscribe'>;
  now?: () => number;
}

const LATENCY_HINT: Record<BufferMode, LatencyHint> = {
  low: 'interactive',
  balanced: 'balanced',
  safe: 'playback',
};

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Application service of the studio window: starts / stops the engine, keeps the engine in sync
 * with the store, manages devices, recording and link downloads. No React, no DOM rendering.
 */
export class StudioController {
  private readonly duck = new DuckController();
  private readonly now: () => number;
  private disposers: Array<() => void> = [];

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => performance.now());
  }

  private get store(): StudioStoreApi {
    return this.deps.store;
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                             */
  /* ------------------------------------------------------------------ */

  /** Subscribes the engine to the store and the music bus to the hub. Returns a disposer. */
  wire(): () => void {
    const { engine, player, hub } = this.deps;
    let last = this.store.getState();
    player.loop = last.music.loop;

    this.disposers.push(
      this.store.subscribe((s) => {
        if (s.params !== last.params) engine.setParams(s.params);
        if (s.monitor !== last.monitor) engine.setMonitor(s.monitor.on, s.monitor.vol);
        if (s.music.vol !== last.music.vol) engine.musicBus?.setVolume(s.music.vol / 100);
        if (s.music.loop !== last.music.loop) player.loop = s.music.loop;
        if (s.music.duck !== last.music.duck) this.duck.configure({ enabled: s.music.duck });
        last = s;
      }),
      hub.subscribe((m) => {
        const bus = engine.musicBus;
        if (!bus) return;
        const target = this.duck.update(m.inPeak, this.now(), this.store.getState().params.bypass);
        bus.setDuck(target.gain, target.timeConstant);
      }),
    );
    this.duck.configure({ enabled: last.music.duck });

    return () => {
      this.disposers.forEach((d) => d());
      this.disposers = [];
    };
  }

  /* ------------------------------------------------------------------ */
  /* engine lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  async start(): Promise<void> {
    const { engine, api, store } = this.deps;
    const s = store.getState();
    if (engine.running || s.engine === 'starting') return;
    store.getState().setEngine('starting');
    store.getState().setStatus('Starting…');
    try {
      const workletSource = await api.dspSource();
      const st = store.getState();
      await engine.start({
        workletSource,
        inputDeviceId: st.dev.in,
        outputDeviceId: st.dev.out,
        monitorDeviceId: st.dev.mon,
        noiseSuppression: st.ns,
        autoGainControl: st.agc,
        latencyHint: LATENCY_HINT[st.buffer],
        params: st.params,
        monitor: { on: st.monitor.on, volume: st.monitor.vol },
        musicVolume: st.music.vol / 100,
      });
      this.duck.reset();
      store.getState().setEngine('running');
      const rate = engine.context?.sampleRate ?? 48000;
      store.getState().setStatus(`Running · ${(rate / 1000).toFixed(1)} kHz`);
      await this.refreshDevices(); // labels are only available once the microphone is open
    } catch (error) {
      store.getState().setEngine('stopped');
      store.getState().setStatus(`Error: ${errorText(error)}`);
    }
  }

  async stop(): Promise<void> {
    const { engine, store } = this.deps;
    if (store.getState().recording) await this.toggleRecording();
    this.deps.player.pause();
    await engine.stop();
    store.getState().setEngine('stopped');
    if (!store.getState().status.startsWith('Error')) store.getState().setStatus('Engine stopped');
  }

  async toggle(): Promise<void> {
    if (this.deps.engine.running) await this.stop();
    else await this.start();
  }

  /** Re-creates the audio graph (needed for input device, buffer and Windows-processing changes). */
  async restartIfRunning(): Promise<void> {
    if (!this.deps.engine.running) return;
    await this.stop();
    await this.start();
  }

  /* ------------------------------------------------------------------ */
  /* devices                                                            */
  /* ------------------------------------------------------------------ */

  async refreshDevices(): Promise<void> {
    const lists = await listDevices();
    const { store, storage } = this.deps;
    store.getState().setDeviceLists(lists);

    // first run: pre-select a virtual cable as the output
    if (!storage.getItem(CABLE_CHOSEN_KEY) && lists.hasLabels) {
      const cable = findVirtualCable(lists.outputs);
      if (cable) {
        store.getState().setDevice('out', cable.deviceId);
        storage.setItem(CABLE_CHOSEN_KEY, '1');
      }
    }
  }

  /** At startup device names are empty until microphone permission exists; ask once. */
  async ensureDeviceLabels(): Promise<void> {
    await this.refreshDevices();
    if (this.store.getState().devices.hasLabels) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await this.refreshDevices();
    } catch {
      /* no permission yet: the lists stay generic */
    }
  }

  async setInputDevice(id: string): Promise<void> {
    this.store.getState().setDevice('in', id);
    await this.restartIfRunning();
  }

  async setOutputDevice(id: string): Promise<void> {
    const { store, engine, storage } = this.deps;
    store.getState().setDevice('out', id);
    storage.setItem(CABLE_CHOSEN_KEY, '1');
    if (!engine.running) return;
    try {
      await engine.setOutputDevice(id);
    } catch {
      await this.restartIfRunning();
    }
  }

  async setMonitorDevice(id: string): Promise<void> {
    this.store.getState().setDevice('mon', id);
    try {
      await this.deps.engine.setMonitorDevice(id);
    } catch {
      /* keep playing on the previous device */
    }
  }

  async setNoiseSuppression(on: boolean): Promise<void> {
    this.store.getState().setNoiseSuppression(on);
    await this.restartIfRunning();
  }

  async setAutoGain(on: boolean): Promise<void> {
    this.store.getState().setAutoGain(on);
    await this.restartIfRunning();
  }

  async setBuffer(mode: BufferMode): Promise<void> {
    this.store.getState().setBuffer(mode);
    await this.restartIfRunning();
  }

  /* ------------------------------------------------------------------ */
  /* recording, links, cable                                            */
  /* ------------------------------------------------------------------ */

  async toggleRecording(): Promise<void> {
    const { engine, store, api } = this.deps;
    if (!engine.isRecording) {
      if (!engine.running) return;
      engine.startRecording();
      store.getState().setRecording(true);
      return;
    }
    // give the worklet a moment to flush its last chunk
    const result = engine.stopRecording();
    store.getState().setRecording(false);
    if (!result) return;
    await new Promise((r) => setTimeout(r, 60));
    if (result.chunks.length === 0) return;
    const wav = encodeWav16Mono(result.chunks, result.sampleRate);
    await api.saveFile(recordingFileName(new Date()), wav, [{ name: 'WAV audio', extensions: ['wav'] }]);
  }

  /** Downloads the audio of a link and appends it to the playlist. */
  async addLink(url: string): Promise<boolean> {
    const { api, player, store } = this.deps;
    const link = url.trim();
    if (!link) return false;
    store.getState().setStatus('Fetching audio… (first time also downloads yt-dlp, ~20 MB)');
    const result = await api.ytFetch(link);
    if (!result.ok) {
      store.getState().setStatus(`Link error: ${result.error}`);
      return false;
    }
    player.addBuffer(result.title || link, result.data, mimeForExtension(result.ext));
    store.getState().setStatus(`Added: ${result.title || link}`);
    return true;
  }

  async installCable(): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.deps.api.installVbCable();
  }
}
