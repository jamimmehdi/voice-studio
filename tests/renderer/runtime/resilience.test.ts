import { vi } from 'vitest';
import { Emitter } from '@engine/audio/emitter';
import { missingDevices, type DeviceLists } from '@engine/audio/devices';
import { FeedbackDetector } from '@engine/audio/feedback-detector';
import { DeviceRecovery, describeMissing } from '@renderer/studio/runtime/device-recovery';
import { FeedbackGuard } from '@renderer/studio/runtime/feedback-guard';
import {
  MemoryStorage,
  loadSeed,
  restoreFromBackup,
  startPersistence,
} from '@renderer/studio/store/persistence';
import { createStudioStore } from '@renderer/studio/store/studio-store';
import { STORAGE_KEY, USER_PRESETS_KEY } from '@shared/persisted-state';
import { createDefaultParams } from '@shared/params';

const lists = (over: Partial<DeviceLists> = {}): DeviceLists => ({
  inputs: [{ deviceId: 'mic1', label: 'Headset mic' }],
  outputs: [
    { deviceId: 'cable', label: 'CABLE Input' },
    { deviceId: 'hp', label: 'Headphones' },
  ],
  hasLabels: true,
  ...over,
});

describe('missingDevices', () => {
  const sel = { in: 'mic1', out: 'cable', mon: 'hp' };

  it('finds nothing when everything selected is plugged in', () => {
    expect(missingDevices(sel, lists())).toEqual([]);
  });

  it('"default" is always present', () => {
    expect(
      missingDevices({ in: 'default', out: 'default', mon: 'default' }, lists({ inputs: [], outputs: [] })),
    ).toEqual([]);
  });

  it('names each unplugged role', () => {
    const m = missingDevices(sel, lists({ inputs: [], outputs: [{ deviceId: 'hp', label: 'Headphones' }] }));
    expect(m.map((x) => x.role)).toEqual(['microphone', 'output']);
  });

  it('cannot judge before the browser has revealed device names', () => {
    expect(missingDevices(sel, lists({ inputs: [], outputs: [], hasLabels: false }))).toEqual([]);
  });

  it('describes what is missing in plain words', () => {
    expect(describeMissing([{ role: 'microphone', deviceId: 'x' }])).toBe('microphone');
    expect(
      describeMissing([
        { role: 'microphone', deviceId: 'x' },
        { role: 'output', deviceId: 'y' },
        { role: 'headphones', deviceId: 'z' },
      ]),
    ).toBe('microphone, virtual cable output and headphones');
  });
});

describe('DeviceRecovery', () => {
  const setup = () => {
    const store = createStudioStore();
    store.getState().setDevice('in', 'mic1');
    store.getState().setDevice('out', 'cable');
    const events = new Emitter<{ inputLost: null }>();
    const engine = { running: true, events };
    let present = lists();
    let failStart = false;
    const controller = {
      stop: vi.fn(async () => {
        engine.running = false;
        store.getState().setEngine('stopped');
      }),
      start: vi.fn(async () => {
        if (failStart) return;
        engine.running = true;
        store.getState().setEngine('running');
      }),
    };
    let deviceChanged: () => void = () => undefined;
    let tick: () => void = () => undefined;
    const recovery = new DeviceRecovery({
      store,
      engine,
      controller,
      listDevices: async () => present,
      onDeviceChange: (cb) => {
        deviceChanged = cb;
        return () => undefined;
      },
      setInterval: ((cb: () => void) => {
        tick = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearInterval: (() => undefined) as typeof clearInterval,
    });
    const stop = recovery.wire();
    store.getState().setEngine('running');
    return {
      store,
      engine,
      events,
      controller,
      recovery,
      stop,
      unplug: (devices: Partial<DeviceLists>) => {
        present = lists(devices);
      },
      failStart: (v: boolean) => {
        failStart = v;
      },
      deviceChanged: () => deviceChanged(),
      poll: () => tick(),
    };
  };

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it('pauses with a clear message when the microphone is unplugged, then resumes by itself', async () => {
    const t = setup();
    t.unplug({ inputs: [] });
    t.deviceChanged();
    await settle();
    expect(t.controller.stop).toHaveBeenCalled();
    expect(t.store.getState().engine).toBe('waiting');
    expect(t.store.getState().notice).toMatchObject({ kind: 'warn' });
    expect(t.store.getState().notice!.text).toMatch(/microphone/);
    expect(t.recovery.isWaiting).toBe(true);

    // still unplugged: it keeps waiting
    t.poll();
    await settle();
    expect(t.controller.start).not.toHaveBeenCalled();

    // plugged back in
    t.unplug({});
    t.deviceChanged();
    await settle();
    expect(t.controller.start).toHaveBeenCalledTimes(1);
    expect(t.store.getState().engine).toBe('running');
    expect(t.store.getState().notice).toMatchObject({ kind: 'info' });
    expect(t.recovery.isWaiting).toBe(false);
  });

  it('also reacts to the virtual cable disappearing', async () => {
    const t = setup();
    t.unplug({ outputs: [{ deviceId: 'hp', label: 'Headphones' }] });
    t.deviceChanged();
    await settle();
    expect(t.store.getState().notice!.text).toMatch(/virtual cable/);
    expect(t.store.getState().engine).toBe('waiting');
  });

  it('keeps waiting when the restart does not work yet, and retries on the next poll', async () => {
    const t = setup();
    t.unplug({ inputs: [] });
    t.deviceChanged();
    await settle();
    t.unplug({});
    t.failStart(true);
    t.poll();
    await settle();
    expect(t.controller.start).toHaveBeenCalledTimes(1);
    expect(t.store.getState().engine).toBe('waiting');
    t.failStart(false);
    t.poll();
    await settle();
    expect(t.store.getState().engine).toBe('running');
  });

  it('a microphone stream that ends on its own restarts the engine when the device is still there', async () => {
    const t = setup();
    t.events.emit('inputLost', null);
    await settle();
    expect(t.controller.stop).toHaveBeenCalled();
    expect(t.controller.start).toHaveBeenCalled();
    expect(t.store.getState().engine).toBe('running');
  });

  it('does nothing while the engine is stopped and everything is in place', async () => {
    const t = setup();
    t.engine.running = false;
    t.deviceChanged();
    await settle();
    expect(t.controller.stop).not.toHaveBeenCalled();
    expect(t.store.getState().notice).toBeNull();
  });
});

describe('FeedbackDetector', () => {
  const binHz = 48000 / 2 / 1024;
  const spectrum = (tonal: number | null, level: number): Float32Array => {
    const s = new Float32Array(1024).fill(-90);
    if (tonal !== null) {
      s[tonal] = level;
      s[tonal - 1] = level - 12;
      s[tonal + 1] = level - 12;
    }
    return s;
  };

  it('flags a single tone that keeps growing', () => {
    const d = new FeedbackDetector({ binHz });
    let flagged = false;
    for (let i = 0; i < 12; i++) flagged = d.feed(spectrum(100, -40 + i * 3));
    expect(flagged).toBe(true);
  });

  it('ignores a steady tone that does not grow', () => {
    const d = new FeedbackDetector({ binHz });
    let flagged = false;
    for (let i = 0; i < 30; i++) flagged = flagged || d.feed(spectrum(100, -20));
    expect(flagged).toBe(false);
  });

  it('ignores speech-like spectra with many harmonics', () => {
    const d = new FeedbackDetector({ binHz });
    let flagged = false;
    for (let i = 0; i < 30; i++) {
      const s = new Float32Array(1024).fill(-80);
      for (const k of [12, 24, 36, 48, 60, 72]) s[k] = -25 + i * 0.5;
      flagged = flagged || d.feed(s);
    }
    expect(flagged).toBe(false);
  });

  it('ignores a tone that moves around', () => {
    const d = new FeedbackDetector({ binHz });
    let flagged = false;
    for (let i = 0; i < 30; i++) flagged = flagged || d.feed(spectrum(60 + (i % 2) * 40, -40 + i));
    expect(flagged).toBe(false);
  });

  it('ignores very quiet tones and rumble below 250 Hz', () => {
    const d = new FeedbackDetector({ binHz });
    let quiet = false;
    for (let i = 0; i < 12; i++) quiet = d.feed(spectrum(100, -70 + i * 3));
    expect(quiet).toBe(false);
    const rumble = new FeedbackDetector({ binHz });
    let low = false;
    for (let i = 0; i < 12; i++) low = rumble.feed(spectrum(5, -40 + i * 3));
    expect(low).toBe(false);
  });
});

describe('FeedbackGuard', () => {
  it('switches Hear myself off and explains why', () => {
    const store = createStudioStore();
    store.getState().setEngine('running');
    store.getState().setMonitor({ on: true });
    let level = -40;
    const analyser = {
      frequencyBinCount: 1024,
      getFloatFrequencyData: (a: Float32Array) => {
        a.fill(-90);
        a[100] = level;
        a[99] = level - 12;
        a[101] = level - 12;
        level += 3;
      },
    };
    const guard = new FeedbackGuard({ store, getAnalyser: () => analyser, sampleRate: () => 48000 });
    let hit = false;
    for (let i = 0; i < 15 && !hit; i++) hit = guard.tick();
    expect(hit).toBe(true);
    expect(store.getState().monitor.on).toBe(false);
    expect(store.getState().notice).toMatchObject({ kind: 'warn' });
    expect(store.getState().notice!.text).toMatch(/Feedback/);
  });

  it('does not look at all while Hear myself is off or the engine is stopped', () => {
    const store = createStudioStore();
    const getAnalyser = vi.fn(() => null);
    const guard = new FeedbackGuard({ store, getAnalyser, sampleRate: () => 48000 });
    expect(guard.tick()).toBe(false);
    store.getState().setEngine('running');
    expect(guard.tick()).toBe(false);
    expect(getAnalyser).not.toHaveBeenCalled();
  });
});

describe('crash-safe persistence', () => {
  it('keeps the previous good value as a backup on every save', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const store = createStudioStore();
    const stop = startPersistence(store, storage, 10);
    store.getState().patchVoice({ pitch: 3 });
    vi.advanceTimersByTime(50);
    store.getState().patchVoice({ pitch: 6 });
    vi.advanceTimersByTime(50);
    const current = JSON.parse(storage.getItem(STORAGE_KEY)!);
    const backup = JSON.parse(storage.getItem(STORAGE_KEY + '.bak')!);
    expect(current.params.voice.pitch).toBe(6);
    expect(backup.params.voice.pitch).toBe(3);
    stop();
    vi.useRealTimers();
  });

  it('loads the backup when the stored value is damaged', () => {
    const storage = new MemoryStorage();
    const params = createDefaultParams();
    params.voice.pitch = 7;
    storage.setItem(STORAGE_KEY, '{ this is not json');
    storage.setItem(STORAGE_KEY + '.bak', JSON.stringify({ v: 2, params }));
    expect(loadSeed(storage).persisted!.params.voice.pitch).toBe(7);

    storage.setItem(USER_PRESETS_KEY, 'garbage');
    storage.setItem(USER_PRESETS_KEY + '.bak', JSON.stringify({ Mine: params }));
    expect(Object.keys(loadSeed(storage).userPresets!)).toEqual(['Mine']);
  });

  it('a damaged value never replaces the older backup', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const params = createDefaultParams();
    storage.setItem(STORAGE_KEY + '.bak', JSON.stringify({ v: 2, params }));
    storage.setItem(STORAGE_KEY, 'broken');
    const store = createStudioStore();
    const stop = startPersistence(store, storage, 10);
    store.getState().patchVoice({ pitch: 1 });
    vi.advanceTimersByTime(50);
    expect(JSON.parse(storage.getItem(STORAGE_KEY + '.bak')!).params).toBeDefined();
    stop();
    vi.useRealTimers();
  });

  it('sends the whole state to the off-site copy, at most every two seconds', () => {
    vi.useFakeTimers();
    let clock = 0;
    const sink = vi.fn();
    const store = createStudioStore();
    const stop = startPersistence(store, new MemoryStorage(), 10, sink, () => clock);
    store.getState().patchVoice({ pitch: 1 });
    vi.advanceTimersByTime(20);
    expect(sink).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(sink.mock.calls[0]![0] as string);
    expect(sent.state.params.voice.pitch).toBe(1);
    expect(sent.presets).toEqual({});

    clock = 500;
    store.getState().patchVoice({ pitch: 2 });
    vi.advanceTimersByTime(20);
    expect(sink).toHaveBeenCalledTimes(1);
    clock = 2600;
    store.getState().patchVoice({ pitch: 3 });
    vi.advanceTimersByTime(20);
    expect(sink).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });

  it('restores an empty browser storage from the off-site copy', async () => {
    const storage = new MemoryStorage();
    const params = createDefaultParams();
    params.voice.pitch = 5;
    const copy = JSON.stringify({ state: { v: 2, params }, presets: { Mine: params } });
    expect(await restoreFromBackup(storage, async () => copy)).toBe(true);
    expect(loadSeed(storage).persisted!.params.voice.pitch).toBe(5);
    expect(Object.keys(loadSeed(storage).userPresets!)).toEqual(['Mine']);
  });

  it('leaves healthy storage alone and survives a missing or broken copy', async () => {
    const healthy = new MemoryStorage();
    healthy.setItem(STORAGE_KEY, JSON.stringify({ v: 2, params: createDefaultParams() }));
    const read = vi.fn(async () => '{"state":{}}');
    expect(await restoreFromBackup(healthy, read)).toBe(false);
    expect(read).not.toHaveBeenCalled();

    const empty = new MemoryStorage();
    expect(await restoreFromBackup(empty, async () => null)).toBe(false);
    expect(await restoreFromBackup(empty, async () => 'not json')).toBe(false);
    expect(await restoreFromBackup(empty, async () => '[]')).toBe(false);
    expect(await restoreFromBackup(empty, async () => Promise.reject(new Error('x')))).toBe(false);
  });
});
