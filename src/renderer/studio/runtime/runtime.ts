import { AudioEngine } from '@engine/audio/audio-engine';
import { MusicPlayer } from '@engine/audio/music-player';
import { listDevices } from '@engine/audio/devices';
import { SoundPlayer } from '@engine/audio/sound-player';
import type { StudioApi } from '@shared/ipc';
import { loadSeed, startPersistence, type KeyValueStorage } from '../store/persistence';
import { createStudioStore, type StudioStoreApi } from '../store/studio-store';
import { StudioController } from './controller';
import { DeviceRecovery } from './device-recovery';
import { FeedbackGuard } from './feedback-guard';
import { startHotkeySync } from './hotkey-sync';
import { ProfileRuntime } from './profile-runtime';
import { SoundController } from './sound-controller';
import { MeterHub } from './meter-hub';
import { startRemoteBridge } from './remote-bridge';
import { wireUpdates } from './updates';

export interface Runtime {
  store: StudioStoreApi;
  engine: AudioEngine;
  player: MusicPlayer;
  hub: MeterHub;
  controller: StudioController;
  sounds: SoundController;
  api: StudioApi;
  /** stops timers, flushes persistence and detaches every listener */
  dispose(): void;
}

export interface RuntimeOptions {
  api?: StudioApi;
  storage?: KeyValueStorage;
  engine?: AudioEngine;
  player?: MusicPlayer;
  soundPlayer?: SoundPlayer;
}

/** Builds the object graph of the studio window. One instance lives for the lifetime of the page. */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const api = options.api ?? window.studio;
  const storage = options.storage ?? window.localStorage;
  const engine = options.engine ?? new AudioEngine();
  const player = options.player ?? new MusicPlayer();

  const store = createStudioStore(loadSeed(storage));
  const hub = new MeterHub(engine);
  const controller = new StudioController({ store, engine, player, api, storage, hub });
  const sounds = new SoundController({
    store,
    engine,
    player: options.soundPlayer ?? new SoundPlayer(),
    api,
  });

  const disposers: Array<() => void> = [];
  disposers.push(startPersistence(store, storage, undefined, (json) => api.stateBackup.write(json)));
  disposers.push(controller.wire());
  disposers.push(sounds.wire());
  disposers.push(
    new DeviceRecovery({
      store,
      engine,
      controller,
      listDevices,
      onDeviceChange: (cb) => {
        const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
        if (!devices?.addEventListener) return () => undefined;
        devices.addEventListener('devicechange', cb);
        return () => devices.removeEventListener('devicechange', cb);
      },
    }).wire(),
  );
  disposers.push(
    new FeedbackGuard({
      store,
      getAnalyser: () => engine.analyser,
      sampleRate: () => engine.context?.sampleRate ?? 48000,
    }).start(),
  );
  disposers.push(startHotkeySync(store, api));
  disposers.push(
    new ProfileRuntime({
      store,
      api,
      startEngine: () => void controller.start(),
      isEngineRunning: () => engine.running,
    }).wire(),
  );
  disposers.push(wireUpdates(api, store));

  // the music <audio> element only exists while the engine runs
  disposers.push(
    engine.events.on('musicBus', (bus) => {
      if (bus) player.attach(bus.element);
      else player.detach();
    }),
  );

  hub.start();
  disposers.push(() => hub.stop());

  disposers.push(
    startRemoteBridge({
      store,
      api,
      toggleEngine: () => void controller.toggle(),
      toggleMusic: () => void player.toggle(),
      playSound: (id) => void sounds.play(id),
      notify: (text) => void api.notify(text),
      getMeters: () => hub.latest,
      getMusic: () => player.snapshot,
      getEngineStats: () => ({ latencyMs: engine.latencyMs, dropouts: engine.meters?.dropouts ?? 0 }),
    }),
  );

  return {
    store,
    engine,
    player,
    hub,
    controller,
    sounds,
    api,
    dispose: () => {
      disposers.forEach((d) => d());
      engine.events.clear();
    },
  };
}
