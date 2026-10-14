import { AudioEngine } from '@engine/audio/audio-engine';
import { MusicPlayer } from '@engine/audio/music-player';
import type { StudioApi } from '@shared/ipc';
import { loadSeed, startPersistence, type KeyValueStorage } from '../store/persistence';
import { createStudioStore, type StudioStoreApi } from '../store/studio-store';
import { StudioController } from './controller';
import { MeterHub } from './meter-hub';
import { startRemoteBridge } from './remote-bridge';
import { wireUpdates } from './updates';

export interface Runtime {
  store: StudioStoreApi;
  engine: AudioEngine;
  player: MusicPlayer;
  hub: MeterHub;
  controller: StudioController;
  api: StudioApi;
  /** stops timers, flushes persistence and detaches every listener */
  dispose(): void;
}

export interface RuntimeOptions {
  api?: StudioApi;
  storage?: KeyValueStorage;
  engine?: AudioEngine;
  player?: MusicPlayer;
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

  const disposers: Array<() => void> = [];
  disposers.push(startPersistence(store, storage));
  disposers.push(controller.wire());
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
    api,
    dispose: () => {
      disposers.forEach((d) => d());
      engine.events.clear();
    },
  };
}
