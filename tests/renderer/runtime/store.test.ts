import { createDefaultParams } from '@shared/params';
import { createDefaultPersisted, STORAGE_KEY, USER_PRESETS_KEY } from '@shared/persisted-state';
import { loadSeed, MemoryStorage, startPersistence } from '@renderer/studio/store/persistence';
import { createStudioStore, toPersisted, WARM_BOOST_DB } from '@renderer/studio/store/studio-store';

describe('studio store', () => {
  it('starts from the persisted state', () => {
    const persisted = createDefaultPersisted();
    persisted.params.voice.pitch = 7;
    persisted.stage = 'eq';
    const s = createStudioStore({ persisted }).getState();
    expect(s.params.voice.pitch).toBe(7);
    expect(s.stage).toBe('eq');
    expect(s.engine).toBe('stopped');
  });

  it('never mutates the previous params object (so subscribers can compare by reference)', () => {
    const store = createStudioStore();
    const before = store.getState().params;
    store.getState().patchVoice({ pitch: 3 });
    const after = store.getState().params;
    expect(after).not.toBe(before);
    expect(before.voice.pitch).toBe(0);
    expect(after.voice.pitch).toBe(3);
  });

  describe('editing marks the preset as custom', () => {
    it('knob style edits do', () => {
      const store = createStudioStore();
      expect(store.getState().preset).toBe('Female – Natural');
      store.getState().patchModule('hpf', { freq: 120 });
      expect(store.getState().preset).toBeNull();
    });

    it('switching a module on / off does not', () => {
      const store = createStudioStore();
      store.getState().toggleModule('comp');
      expect(store.getState().params.comp.on).toBe(false);
      expect(store.getState().preset).toBe('Female – Natural');
    });

    it('changing quality (custom: false) does not', () => {
      const store = createStudioStore();
      store.getState().patchVoice({ quality: 1024 }, { custom: false });
      expect(store.getState().params.voice.quality).toBe(1024);
      expect(store.getState().preset).toBe('Female – Natural');
    });
  });

  it('setEqBand edits one band and ignores bad indexes', () => {
    const store = createStudioStore();
    store.getState().setEqBand(2, { gain: 4, freq: 1500 });
    expect(store.getState().params.eq.bands[2]).toMatchObject({ gain: 4, freq: 1500, type: 'peaking' });
    expect(() => store.getState().setEqBand(99, { gain: 1 })).not.toThrow();
    expect(store.getState().params.eq.bands).toHaveLength(6);
  });

  it('setGain rounds to 0.1 dB and clamps to ±24', () => {
    const store = createStudioStore();
    store.getState().setGain('inGain', 3.14159);
    expect(store.getState().params.inGain).toBe(3.1);
    store.getState().setGain('outGain', 99);
    expect(store.getState().params.outGain).toBe(24);
    store.getState().setGain('outGain', -99);
    expect(store.getState().params.outGain).toBe(-24);
  });

  it('warmer tone raises and restores the low shelf exactly once', () => {
    const store = createStudioStore();
    const base = store.getState().params.eq.bands[0].gain;
    store.getState().setWarm(true);
    store.getState().setWarm(true); // idempotent
    expect(store.getState().params.eq.bands[0].gain).toBeCloseTo(base + WARM_BOOST_DB, 6);
    expect(store.getState().warm).toBe(true);
    store.getState().setWarm(false);
    expect(store.getState().params.eq.bands[0].gain).toBeCloseTo(base, 6);
    expect(store.getState().warm).toBe(false);
  });

  describe('presets', () => {
    it('applies a built-in preset, clears warm and keeps the tuned chain', () => {
      const store = createStudioStore();
      store.getState().patchModule('hpf', { freq: 150 });
      store.getState().setWarm(true);
      expect(store.getState().applyPreset('Robot')).toBe(true);
      const s = store.getState();
      expect(s.preset).toBe('Robot');
      expect(s.warm).toBe(false);
      expect(s.params.voice.robot).toBe(true);
      expect(s.params.hpf.freq).toBe(150);
    });

    it('returns false for an unknown preset and leaves the state alone', () => {
      const store = createStudioStore();
      const before = store.getState().params;
      expect(store.getState().applyPreset('nope')).toBe(false);
      expect(store.getState().params).toBe(before);
    });

    it('saves, re-applies and deletes a user preset', () => {
      const store = createStudioStore();
      store.getState().patchVoice({ pitch: -7 });
      store.getState().saveUserPreset('  Deep me  ');
      expect(Object.keys(store.getState().userPresets)).toEqual(['Deep me']);
      expect(store.getState().preset).toBe('Deep me');

      store.getState().applyPreset('Robot');
      expect(store.getState().params.voice.pitch).toBe(-2);
      store.getState().applyPreset('Deep me');
      expect(store.getState().params.voice.pitch).toBe(-7);

      store.getState().deleteUserPreset('Deep me');
      expect(store.getState().userPresets).toEqual({});
      expect(store.getState().preset).toBeNull();
    });

    it('ignores empty preset names', () => {
      const store = createStudioStore();
      store.getState().saveUserPreset('   ');
      expect(store.getState().userPresets).toEqual({});
    });

    it('a saved snapshot is independent of later edits', () => {
      const store = createStudioStore();
      store.getState().saveUserPreset('A');
      store.getState().patchVoice({ pitch: 11 });
      expect(store.getState().userPresets.A!.voice.pitch).not.toBe(11);
    });
  });

  it('device, monitor, music and session setters', () => {
    const s = createStudioStore().getState();
    s.setDevice('out', 'cable');
    s.setMonitor({ on: true });
    s.setMonitor({ vol: 0.3 });
    s.setMusic({ show: true });
    s.setBuffer('safe');
    s.setStatus('hello');
    s.setModal('about');
    const next = createStudioStore().getState();
    expect(next.dev.out).toBe('default'); // separate instance
    // verify on the first instance:
    const store = createStudioStore();
    store.getState().setDevice('out', 'cable');
    store.getState().setMonitor({ on: true });
    store.getState().setMonitor({ vol: 0.3 });
    store.getState().setMusic({ show: true });
    store.getState().setBuffer('safe');
    store.getState().setModal('about');
    const st = store.getState();
    expect(st.dev.out).toBe('cable');
    expect(st.monitor).toEqual({ on: true, vol: 0.3 });
    expect(st.music.show).toBe(true);
    expect(st.buffer).toBe('safe');
    expect(st.modal).toBe('about');
  });
});

describe('persistence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loadSeed reads the current format and the user presets', () => {
    const storage = new MemoryStorage();
    const persisted = createDefaultPersisted();
    persisted.params.voice.pitch = 5;
    storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const custom = createDefaultParams();
    custom.voice.formant = 4;
    storage.setItem(USER_PRESETS_KEY, JSON.stringify({ Mine: custom, Broken: 12 }));
    const seed = loadSeed(storage);
    expect(seed.persisted!.params.voice.pitch).toBe(5);
    expect(seed.migrated).toBe(false);
    expect(Object.keys(seed.userPresets!)).toEqual(['Mine']);
    expect(seed.userPresets!.Mine!.voice.formant).toBe(4);
  });

  it('loadSeed flags a legacy (pre-2.0) state as migrated', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ params: { voice: { pitch: 9 } }, dev: { out: 'cable' } }));
    const seed = loadSeed(storage);
    expect(seed.migrated).toBe(true);
    expect(seed.persisted!.params.voice.pitch).toBe(0);
    expect(seed.persisted!.dev.out).toBe('cable');
  });

  it('loadSeed survives corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{oops');
    storage.setItem(USER_PRESETS_KEY, '[1,2');
    const seed = loadSeed(storage);
    expect(seed.persisted!.params).toEqual(createDefaultParams());
    expect(seed.userPresets).toEqual({});
  });

  it('writes after a debounce, coalescing bursts, and flushes on dispose', () => {
    const storage = new MemoryStorage();
    const set = vi.spyOn(storage, 'setItem');
    const store = createStudioStore();
    const stop = startPersistence(store, storage, 300);

    store.getState().patchVoice({ pitch: 1 });
    store.getState().patchVoice({ pitch: 2 });
    store.getState().patchVoice({ pitch: 3 });
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(set).toHaveBeenCalledTimes(2); // state + presets, once
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).params.voice.pitch).toBe(3);

    store.getState().patchVoice({ pitch: 9 });
    stop(); // flush
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).params.voice.pitch).toBe(9);
  });

  it('does not write for session-only changes', () => {
    const storage = new MemoryStorage();
    const set = vi.spyOn(storage, 'setItem');
    const store = createStudioStore();
    startPersistence(store, storage, 100);
    store.getState().patchVoice({ pitch: 1 });
    vi.advanceTimersByTime(150);
    set.mockClear();
    store.getState().setStatus('Running');
    store.getState().setEngine('running');
    store.getState().setModal('about');
    vi.advanceTimersByTime(500);
    expect(set).not.toHaveBeenCalled();
  });

  it('toPersisted keeps only the persisted subset', () => {
    const keys = Object.keys(toPersisted(createStudioStore().getState())).sort();
    expect(keys).toEqual([
      'agc',
      'autoBuffer',
      'buffer',
      'dev',
      'hotkeys',
      'monitor',
      'music',
      'ns',
      'params',
      'preset',
      'profiles',
      'setupDone',
      'soundOptions',
      'sounds',
      'stage',
      'v',
      'warm',
    ]);
  });
});
