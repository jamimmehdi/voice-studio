import type { AudioEngine } from '@engine/audio/audio-engine';
import type { QuickCommand, QuickState } from '@shared/protocols';
import { MeterHub } from '@renderer/studio/runtime/meter-hub';
import {
  applyQuickCommand,
  buildQuickState,
  startRemoteBridge,
} from '@renderer/studio/runtime/remote-bridge';
import { startUpdateDownload, wireUpdates } from '@renderer/studio/runtime/updates';
import { createStudioStore } from '@renderer/studio/store/studio-store';
import { fakeApi } from '../../helpers/fakes';

const music = { trackCount: 0, title: '', playing: false, progress: 0 };

describe('buildQuickState', () => {
  const base = () => createStudioStore().getState();

  it('reports the engine, preset and voice', () => {
    const s = createStudioStore();
    s.getState().setEngine('running');
    s.getState().patchVoice({ pitch: 4.5, formant: 2.8 });
    s.getState().setMonitor({ on: true });
    const state = buildQuickState({
      state: s.getState(),
      meters: { inPeak: 0.5 },
      music,
      latencyMs: 43,
      dropouts: 0,
    });
    expect(state.running).toBe(true);
    expect(state.pitch).toBe(4.5);
    expect(state.formant).toBe(2.8);
    expect(state.monitor).toBe(true);
    expect(state.stats).toBe('43 ms · 0 dropouts');
    expect(state.preset).toBeNull(); // edited -> custom
    expect(state.chips).toHaveLength(8);
    expect(state.level).toBeGreaterThan(0.5);
  });

  it('is quiet when the engine is stopped', () => {
    const state = buildQuickState({
      state: base(),
      meters: { inPeak: 1 },
      music,
      latencyMs: 99,
      dropouts: 4,
    });
    expect(state.running).toBe(false);
    expect(state.level).toBe(0);
    expect(state.stats).toBe('');
  });

  it('describes the music player', () => {
    const state = buildQuickState({
      state: base(),
      meters: { inPeak: 0 },
      latencyMs: 0,
      dropouts: 0,
      music: { trackCount: 2, title: 'Night Drive', playing: true, progress: 0.3333 },
    });
    expect(state.music).toEqual({ has: true, title: 'Night Drive', playing: true, progress: 0.33 });
  });

  it('pluralises dropouts', () => {
    const s = createStudioStore();
    s.getState().setEngine('running');
    expect(
      buildQuickState({ state: s.getState(), meters: { inPeak: 0 }, music, latencyMs: 20, dropouts: 1 })
        .stats,
    ).toBe('20 ms · 1 dropout');
  });
});

describe('applyQuickCommand', () => {
  const setup = () => {
    const store = createStudioStore();
    const calls: string[] = [];
    const targets = {
      store,
      toggleEngine: () => calls.push('engine'),
      toggleMusic: () => calls.push('music'),
    };
    return { store, calls, apply: (c: QuickCommand) => applyQuickCommand(c, targets) };
  };

  it('engine and music commands are delegated', () => {
    const { apply, calls } = setup();
    apply({ type: 'toggleEngine' });
    apply({ type: 'music' });
    expect(calls).toEqual(['engine', 'music']);
  });

  it('preset command applies a preset', () => {
    const { apply, store } = setup();
    apply({ type: 'preset', name: 'Giant / Monster' });
    expect(store.getState().preset).toBe('Giant / Monster');
    expect(store.getState().params.voice.pitch).toBe(-9);
  });

  it('voice command clamps, rounds and enables the voice', () => {
    const { apply, store } = setup();
    store.getState().patchVoice({ on: false });
    apply({ type: 'voice', pitch: 50, formant: -3.14159 });
    const v = store.getState().params.voice;
    expect(v.pitch).toBe(12);
    expect(v.formant).toBe(-3.1);
    expect(v.on).toBe(true);
    expect(store.getState().preset).toBeNull();
  });

  it('a single-axis voice command keeps the other value', () => {
    const { apply, store } = setup();
    store.getState().patchVoice({ pitch: 4, formant: 2 });
    apply({ type: 'voice', pitch: 6 });
    expect(store.getState().params.voice).toMatchObject({ pitch: 6, formant: 2 });
  });

  it('monitor / bypass / gate toggle', () => {
    const { apply, store } = setup();
    apply({ type: 'monitor' });
    apply({ type: 'bypass' });
    apply({ type: 'gate' });
    expect(store.getState().monitor.on).toBe(true);
    expect(store.getState().params.bypass).toBe(true);
    expect(store.getState().params.exp.on).toBe(false);
    apply({ type: 'monitor' });
    expect(store.getState().monitor.on).toBe(false);
  });

  it('window commands are not handled in the renderer', () => {
    const { apply, calls, store } = setup();
    const before = store.getState().params;
    apply({ type: 'openStudio' });
    apply({ type: 'hideCompact' });
    expect(calls).toEqual([]);
    expect(store.getState().params).toBe(before);
  });
});

describe('startRemoteBridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pushes only when the snapshot changes and handles incoming commands', () => {
    const store = createStudioStore();
    const api = fakeApi();
    let commandListener: ((c: QuickCommand) => void) | null = null;
    (api.quick.onCommand as ReturnType<typeof vi.fn>).mockImplementation((cb: (c: QuickCommand) => void) => {
      commandListener = cb;
      return () => {
        commandListener = null;
      };
    });
    const pushed: QuickState[] = [];
    (api.quick.pushState as ReturnType<typeof vi.fn>).mockImplementation((s: QuickState) => pushed.push(s));
    const toggles: string[] = [];

    const stop = startRemoteBridge({
      store,
      api,
      toggleEngine: () => toggles.push('engine'),
      toggleMusic: () => toggles.push('music'),
      getMeters: () => ({ inPeak: 0 }),
      getMusic: () => music,
      getEngineStats: () => ({ latencyMs: 0, dropouts: 0 }),
      intervalMs: 100,
    });

    expect(pushed).toHaveLength(1); // initial snapshot
    vi.advanceTimersByTime(500);
    expect(pushed).toHaveLength(1); // nothing changed

    store.getState().patchVoice({ pitch: 3 });
    vi.advanceTimersByTime(100);
    expect(pushed).toHaveLength(2);
    expect(pushed[1]!.pitch).toBe(3);

    commandListener!({ type: 'toggleEngine' });
    commandListener!({ type: 'bypass' });
    expect(toggles).toEqual(['engine']);
    expect(pushed.at(-1)!.bypass).toBe(true); // pushed immediately after the command

    stop();
    store.getState().patchVoice({ pitch: 7 });
    vi.advanceTimersByTime(1000);
    expect(pushed.at(-1)!.pitch).toBe(3);
    expect(commandListener).toBeNull();
  });
});

describe('MeterHub', () => {
  it('smooths engine meters and notifies subscribers on each tick', () => {
    const engine = {
      running: true,
      meters: {
        inPeak: 0.8,
        outPeak: 0.4,
        exp: 0,
        deess: 0,
        comp: -6,
        lim: 0,
        latencySamples: 0,
        dropouts: 0,
      },
    };
    const hub = new MeterHub(engine as unknown as AudioEngine, () => 0);
    const seen: number[] = [];
    const off = hub.subscribe((m) => seen.push(m.inPeak));
    hub.tick();
    engine.meters = { ...engine.meters, inPeak: 0 };
    hub.tick();
    expect(seen[0]).toBe(0.8);
    expect(seen[1]).toBeCloseTo(0.72, 6);
    off();
    hub.tick();
    expect(seen).toHaveLength(2);
    expect(hub.latest.inPeak).toBeCloseTo(0.648, 6);
  });

  it('falls toward silence when the engine is stopped', () => {
    const engine = { running: false, meters: null };
    const hub = new MeterHub(engine as unknown as AudioEngine, () => 0);
    expect(hub.tick().inPeak).toBe(0);
  });

  it('start / stop run a timer', () => {
    vi.useFakeTimers();
    const hub = new MeterHub({ running: false, meters: null } as unknown as AudioEngine, () => 0);
    const spy = vi.fn();
    hub.subscribe(spy);
    hub.start(10);
    hub.start(10); // idempotent
    vi.advanceTimersByTime(35);
    expect(spy).toHaveBeenCalledTimes(3);
    hub.stop();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('update wiring', () => {
  const capture = () => {
    const api = fakeApi();
    const handlers: Record<string, (p?: never) => void> = {};
    for (const k of ['onAvailable', 'onProgress', 'onDownloaded', 'onError'] as const) {
      (api.update[k] as ReturnType<typeof vi.fn>).mockImplementation((cb: (p?: never) => void) => {
        handlers[k] = cb;
        return () => undefined;
      });
    }
    return { api, handlers };
  };

  it('mirrors update events into the store', () => {
    const store = createStudioStore();
    const { api, handlers } = capture();
    wireUpdates(api, store);

    (handlers.onAvailable as unknown as (i: { version: string; notes: string }) => void)({
      version: '1.3.0',
      notes: 'Faster',
    });
    expect(store.getState().update).toEqual({
      phase: 'available',
      info: { version: '1.3.0', notes: 'Faster' },
    });

    (handlers.onProgress as unknown as (p: { percent: number }) => void)({ percent: 42 });
    expect(store.getState().update).toEqual({ phase: 'downloading', percent: 42 });

    (handlers.onDownloaded as unknown as () => void)();
    expect(store.getState().update).toEqual({ phase: 'restarting' });
  });

  it('only surfaces errors that happen while downloading', () => {
    const store = createStudioStore();
    const { api, handlers } = capture();
    wireUpdates(api, store);
    (handlers.onError as unknown as (m: string) => void)('network');
    expect(store.getState().update.phase).toBe('idle'); // a failed check is silent

    (handlers.onAvailable as unknown as (i: { version: string; notes: string }) => void)({
      version: '2',
      notes: '',
    });
    store.getState().setUpdate({ phase: 'downloading', percent: 5 });
    (handlers.onError as unknown as (m: string) => void)('disk full');
    expect(store.getState().update).toMatchObject({ phase: 'failed', message: 'disk full' });
  });

  it('startUpdateDownload reports a refused download', async () => {
    const store = createStudioStore();
    const api = fakeApi({
      update: { ...fakeApi().update, download: vi.fn(async () => ({ ok: false as const, error: 'nope' })) },
    });
    store.getState().setUpdate({ phase: 'available', info: { version: '2', notes: '' } });
    await startUpdateDownload(api, store);
    expect(store.getState().update).toMatchObject({
      phase: 'failed',
      message: 'nope',
      info: { version: '2' },
    });
  });
});
