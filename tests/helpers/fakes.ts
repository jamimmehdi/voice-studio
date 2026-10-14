import { vi } from 'vitest';
import type { AudioEngine, EngineEvents, EngineMeters, EngineStartOptions } from '@engine/audio/audio-engine';
import { Emitter } from '@engine/audio/emitter';
import { MusicPlayer } from '@engine/audio/music-player';
import type { StudioApi } from '@shared/ipc';
import type { StudioParams } from '@shared/params';
import { MemoryStorage } from '@renderer/studio/store/persistence';
import { createStudioStore, type StoreSeed } from '@renderer/studio/store/studio-store';
import { StudioController } from '@renderer/studio/runtime/controller';
import { MeterHub } from '@renderer/studio/runtime/meter-hub';

export interface FakeBus {
  element: object;
  setVolume: ReturnType<typeof vi.fn>;
  setDuck: ReturnType<typeof vi.fn>;
}

/** Stand-in for AudioEngine that records calls instead of touching Web Audio. */
export class FakeEngine {
  running = false;
  meters: EngineMeters | null = null;
  context: { sampleRate: number } | null = null;
  analyser = null;
  musicBus: FakeBus | null = null;
  latencyMs = 0;
  isRecording = false;
  events = new Emitter<EngineEvents>();

  calls: string[] = [];
  startOptions: EngineStartOptions | null = null;
  params: StudioParams | null = null;
  monitor: { on: boolean; vol: number } | null = null;
  failStartWith: string | null = null;
  recorded: { chunks: Float32Array[]; sampleRate: number } | null = {
    chunks: [Float32Array.from([0, 0.5, -0.5])],
    sampleRate: 48000,
  };

  start = vi.fn(async (opts: EngineStartOptions): Promise<void> => {
    this.calls.push('start');
    if (this.failStartWith) throw new Error(this.failStartWith);
    this.startOptions = opts;
    this.running = true;
    this.context = { sampleRate: 48000 };
    this.musicBus = { element: {}, setVolume: vi.fn(), setDuck: vi.fn() };
  });

  stop = vi.fn(async (): Promise<void> => {
    this.calls.push('stop');
    this.running = false;
    this.context = null;
    this.musicBus = null;
    this.isRecording = false;
  });

  setParams = vi.fn((p: StudioParams): void => {
    this.params = p;
  });

  setMonitor = vi.fn((on: boolean, vol: number): void => {
    this.monitor = { on, vol };
  });

  setMonitorDevice = vi.fn(async (_id: string): Promise<void> => undefined);
  setOutputDevice = vi.fn(async (_id: string): Promise<void> => undefined);

  startRecording = vi.fn((): void => {
    this.isRecording = true;
  });

  stopRecording = vi.fn(() => {
    this.isRecording = false;
    return this.recorded;
  });

  asEngine(): AudioEngine {
    return this as unknown as AudioEngine;
  }
}

export function fakeApi(over: Partial<StudioApi> = {}): StudioApi {
  const noop = (): (() => void) => () => undefined;
  return {
    appInfo: vi.fn(async () => ({ version: '9.9.9', packaged: false, author: 'Jamim Mehdi' })),
    dspSource: vi.fn(async () => '/* worklet */'),
    ytFetch: vi.fn(async () => ({ ok: false as const, error: 'offline' })),
    saveFile: vi.fn(async () => 'C:\\out.wav'),
    installVbCable: vi.fn(async () => ({ ok: true as const })),
    openExternal: vi.fn(async () => undefined),
    settings: {
      get: vi.fn(async () => ({ shortcut: 'Control+Alt+V', shortcutLabel: 'Ctrl + Alt + V' })),
      setShortcut: vi.fn(async (a: string) => ({ ok: true as const, shortcutLabel: a })),
    },
    quitApp: vi.fn(async () => undefined),
    openCompact: vi.fn(async () => true),
    quick: { onCommand: vi.fn(noop), pushState: vi.fn() },
    update: {
      check: vi.fn(async () => ({ ok: true as const })),
      download: vi.fn(async () => ({ ok: true as const })),
      onAvailable: vi.fn(noop),
      onNone: vi.fn(noop),
      onProgress: vi.fn(noop),
      onDownloaded: vi.fn(noop),
      onError: vi.fn(noop),
    },
    ...over,
  };
}

export interface Harness {
  store: ReturnType<typeof createStudioStore>;
  engine: FakeEngine;
  player: MusicPlayer;
  api: StudioApi;
  storage: MemoryStorage;
  hub: MeterHub;
  controller: StudioController;
}

/** A controller wired to fakes, plus everything needed to inspect it. */
export function createHarness(seed: StoreSeed = {}, apiOver: Partial<StudioApi> = {}): Harness {
  const store = createStudioStore(seed);
  const engine = new FakeEngine();
  const player = new MusicPlayer();
  const api = fakeApi(apiOver);
  const storage = new MemoryStorage();
  const hub = new MeterHub(engine.asEngine(), () => 0);
  const controller = new StudioController({
    store,
    engine: engine.asEngine(),
    player,
    api,
    storage,
    hub,
    now: () => 0,
  });
  return { store, engine, player, api, storage, hub, controller };
}
