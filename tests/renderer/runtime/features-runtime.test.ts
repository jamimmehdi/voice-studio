import { vi } from 'vitest';
import { bindingsFrom, startHotkeySync } from '@renderer/studio/runtime/hotkey-sync';
import { ProfileRuntime } from '@renderer/studio/runtime/profile-runtime';
import { applyQuickCommand, buildQuickState } from '@renderer/studio/runtime/remote-bridge';
import { SoundController, cleanName, voiceLevel } from '@renderer/studio/runtime/sound-controller';
import { createStudioStore } from '@renderer/studio/store/studio-store';
import { fakeApi } from '../../helpers/fakes';

describe('store: 2.1 actions', () => {
  it('profiles can be added, patched and removed (executable names are lower case)', () => {
    const store = createStudioStore();
    store.getState().upsertProfile({ exe: 'Game.EXE', name: 'Game', preset: 'Robot', start: false });
    store.getState().upsertProfile({ exe: 'game.exe', name: 'Game', preset: 'Giant / Monster', start: true });
    expect(store.getState().profiles.apps).toEqual([
      { exe: 'game.exe', name: 'Game', preset: 'Giant / Monster', start: true },
    ]);
    store.getState().patchProfile('game.exe', { start: false });
    expect(store.getState().profiles.apps[0]!.start).toBe(false);
    store.getState().removeProfile('game.exe');
    expect(store.getState().profiles.apps).toEqual([]);
  });

  it('hotkeys are set and cleared; removing a sound drops its key', () => {
    const store = createStudioStore();
    const s = (): ReturnType<typeof store.getState> => store.getState();
    s().setVoiceKey('Robot', 'Control+Alt+1');
    expect(s().hotkeys.voices).toEqual({ Robot: 'Control+Alt+1' });
    s().setVoiceKey('Robot', null);
    expect(s().hotkeys.voices).toEqual({});

    s().addSound({ id: 'a1b2c3d4e5f60718', name: 'Horn' });
    s().setSoundKey('a1b2c3d4e5f60718', 'Control+Alt+2');
    s().removeSound('a1b2c3d4e5f60718');
    expect(s().sounds).toEqual([]);
    expect(s().hotkeys.sounds).toEqual({});
  });

  it('remembers the voice for a quick switch and restores it, edits and all', () => {
    const store = createStudioStore();
    const s = (): ReturnType<typeof store.getState> => store.getState();
    s().patchVoice({ pitch: 7 });
    const before = s().params;
    s().rememberVoice();
    s().applyPreset('Robot');
    expect(s().params.voice.pitch).not.toBe(7);
    s().restoreVoice();
    expect(s().params).toEqual(before);
    expect(s().preset).toBeNull();
    s().restoreVoice(); // nothing remembered: no-op
    expect(s().params).toEqual(before);
  });

  it('imports voices as user presets without touching the active voice', () => {
    const store = createStudioStore();
    const voices = { Imported: store.getState().params };
    store.getState().importVoices(voices);
    expect(Object.keys(store.getState().userPresets)).toContain('Imported');
  });
});

describe('hotkey sync', () => {
  it('only sends bindings for sounds that still exist', () => {
    const store = createStudioStore();
    store.getState().addSound({ id: 'aaaaaaaaaaaaaaaa', name: 'A' });
    store.getState().setSoundKey('aaaaaaaaaaaaaaaa', 'Control+Alt+5');
    store.getState().setSoundKey('bbbbbbbbbbbbbbbb', 'Control+Alt+6');
    store.getState().setQuickKey({ preset: 'Robot', accelerator: 'Control+Alt+9' });
    expect(bindingsFrom(store.getState())).toEqual({
      voices: {},
      sounds: { aaaaaaaaaaaaaaaa: 'Control+Alt+5' },
      quick: { preset: 'Robot', accelerator: 'Control+Alt+9' },
    });
  });

  it('pushes once at start and again (debounced) when the bindings change', () => {
    vi.useFakeTimers();
    const store = createStudioStore();
    const api = fakeApi();
    const stop = startHotkeySync(store, api, 100);
    expect(api.hotkeys.set).toHaveBeenCalledTimes(1);

    store.getState().setVoiceKey('Robot', 'Control+Alt+1');
    store.getState().setVoiceKey('Giant / Monster', 'Control+Alt+2');
    expect(api.hotkeys.set).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    expect(api.hotkeys.set).toHaveBeenCalledTimes(2);
    expect((api.hotkeys.set as ReturnType<typeof vi.fn>).mock.calls[1]![0].voices).toEqual({
      Robot: 'Control+Alt+1',
      'Giant / Monster': 'Control+Alt+2',
    });

    // unrelated changes do not re-register shortcuts
    store.getState().patchVoice({ pitch: 3 });
    vi.advanceTimersByTime(300);
    expect(api.hotkeys.set).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });

  it('tells the user when a shortcut could not be registered', async () => {
    vi.useFakeTimers();
    const store = createStudioStore();
    const api = fakeApi({
      hotkeys: { set: vi.fn(async () => ({ ok: false as const, failed: ['Control+Alt+1'] })) },
    });
    store.getState().setVoiceKey('Robot', 'Control+Alt+1');
    startHotkeySync(store, api, 10);
    await vi.advanceTimersByTimeAsync(20);
    expect(store.getState().status).toContain('Control+Alt+1');
    vi.useRealTimers();
  });
});

describe('ProfileRuntime', () => {
  const setup = () => {
    const store = createStudioStore();
    let listener: ((exe: string | null) => void) | null = null;
    const api = fakeApi({
      foreground: {
        setActive: vi.fn(async () => null),
        onChange: vi.fn((cb) => {
          listener = cb;
          return () => undefined;
        }),
        listRunning: vi.fn(async () => []),
      },
    });
    let running = false;
    const start = vi.fn(() => {
      running = true;
    });
    const runtime = new ProfileRuntime({
      store,
      api,
      startEngine: start,
      isEngineRunning: () => running,
    });
    const stop = runtime.wire();
    store.getState().setProfilesEnabled(true);
    store.getState().upsertProfile({ exe: 'valorant.exe', name: 'Valorant', preset: 'Robot', start: true });
    store.getState().setProfileFallback('Female – Natural');
    return { store, api, start, stop, emit: (exe: string | null) => listener?.(exe) };
  };

  it('loads the voice of the program in front and starts the engine', () => {
    const { store, emit, start } = setup();
    emit('valorant.exe');
    expect(store.getState().preset).toBe('Robot');
    expect(start).toHaveBeenCalledTimes(1);
    expect(store.getState().foreground).toBe('valorant.exe');
  });

  it('returns to the fallback voice after leaving a listed program', () => {
    const { store, emit } = setup();
    emit('valorant.exe');
    emit('chrome.exe');
    expect(store.getState().preset).toBe('Female – Natural');
  });

  it('does nothing for unlisted programs, for itself, or while switched off', () => {
    const { store, emit } = setup();
    store.getState().applyPreset('Giant / Monster');
    emit('chrome.exe');
    emit('Voice Studio.exe'.toLowerCase());
    expect(store.getState().preset).toBe('Giant / Monster');

    emit('valorant.exe');
    expect(store.getState().preset).toBe('Robot');
    emit('voice studio.exe'); // looking at the app must not trigger the fallback
    expect(store.getState().preset).toBe('Robot');

    store.getState().setProfilesEnabled(false);
    store.getState().applyPreset('Giant / Monster');
    emit('valorant.exe');
    expect(store.getState().preset).toBe('Giant / Monster');
  });

  it('asks the main process to start and stop watching', () => {
    const { store, api, stop } = setup();
    expect(api.foreground.setActive).toHaveBeenCalledWith(true);
    store.getState().setProfilesEnabled(false);
    expect(api.foreground.setActive).toHaveBeenCalledWith(false);
    stop();
  });
});

describe('sound controller', () => {
  const fakeEngine = () => {
    const listeners = new Set<(bus: unknown) => void>();
    return {
      events: {
        on: (name: string, cb: (bus: unknown) => void) => {
          if (name === 'musicBus') listeners.add(cb);
          return () => listeners.delete(cb);
        },
      },
      context: null as unknown,
      musicBus: null as unknown,
      setVoiceLevel: vi.fn(),
      emitBus: () => listeners.forEach((l) => l(null)),
    };
  };
  const fakePlayer = () => {
    const handlers = new Set<(ids: readonly string[]) => void>();
    return {
      attach: vi.fn(),
      play: vi.fn(async (_id: string, load: () => Promise<ArrayBuffer | null>) => {
        await load();
        return 1;
      }),
      stop: vi.fn(),
      stopAll: vi.fn(),
      forget: vi.fn(),
      playing: [] as string[],
      events: {
        on: (_n: string, cb: (ids: readonly string[]) => void) => {
          handlers.add(cb);
          return () => handlers.delete(cb);
        },
        emit: (ids: string[]) => handlers.forEach((h) => h(ids)),
      },
    };
  };

  it('computes the voice level: mute wins, then the lower-while-playing option', () => {
    expect(voiceLevel(false, false, true)).toBe(1);
    expect(voiceLevel(false, true, true)).toBeLessThan(1);
    expect(voiceLevel(false, true, false)).toBe(1);
    expect(voiceLevel(true, true, false)).toBe(0);
  });

  it('cleans file names for pad labels', () => {
    expect(cleanName('air_horn-loud.mp3')).toBe('air horn loud');
    expect(cleanName('.mp3')).toBe('Sound');
    expect(cleanName('x'.repeat(100) + '.wav').length).toBe(40);
  });

  it('adds a clip through the main process and shows it on the board', async () => {
    const store = createStudioStore();
    const api = fakeApi();
    const c = new SoundController({
      store,
      engine: fakeEngine() as never,
      player: fakePlayer() as never,
      api,
    });
    const entry = await c.addFile('boom.mp3', new ArrayBuffer(4));
    expect(api.sounds.add).toHaveBeenCalledWith('boom.mp3', expect.any(ArrayBuffer));
    expect(store.getState().sounds).toEqual([entry]);
    expect(entry.name).toBe('boom');
  });

  it('plays only known clips and loads bytes lazily', async () => {
    const store = createStudioStore();
    const api = fakeApi();
    const player = fakePlayer();
    const c = new SoundController({ store, engine: fakeEngine() as never, player: player as never, api });
    expect(await c.play('unknown')).toBe(false);
    store.getState().addSound({ id: 'a1b2c3d4e5f60718', name: 'Boom' });
    expect(await c.play('a1b2c3d4e5f60718')).toBe(true);
    expect(api.sounds.read).toHaveBeenCalledWith('a1b2c3d4e5f60718');
  });

  it('lowers the voice while a clip plays and when muted', () => {
    const store = createStudioStore();
    const engine = fakeEngine();
    const player = fakePlayer();
    const c = new SoundController({
      store,
      engine: engine as never,
      player: player as never,
      api: fakeApi(),
    });
    const stop = c.wire();

    player.events.emit(['x']);
    expect(store.getState().playingSounds).toEqual(['x']);
    expect(engine.setVoiceLevel).toHaveBeenLastCalledWith(voiceLevel(false, true, true));
    player.events.emit([]);
    expect(engine.setVoiceLevel).toHaveBeenLastCalledWith(1);
    store.getState().setMuted(true);
    expect(engine.setVoiceLevel).toHaveBeenLastCalledWith(0);
    stop();
  });

  it('removing a clip forgets it everywhere', async () => {
    const store = createStudioStore();
    const api = fakeApi();
    const player = fakePlayer();
    const c = new SoundController({ store, engine: fakeEngine() as never, player: player as never, api });
    store.getState().addSound({ id: 'a1b2c3d4e5f60718', name: 'Boom' });
    await c.remove('a1b2c3d4e5f60718');
    expect(player.forget).toHaveBeenCalledWith('a1b2c3d4e5f60718');
    expect(api.sounds.remove).toHaveBeenCalledWith('a1b2c3d4e5f60718');
    expect(store.getState().sounds).toEqual([]);
  });
});

describe('quick commands from hotkeys and phones', () => {
  const targets = () => {
    const store = createStudioStore();
    const notes: string[] = [];
    const played: string[] = [];
    return {
      store,
      notes,
      played,
      t: {
        store,
        toggleEngine: () => undefined,
        toggleMusic: () => undefined,
        playSound: (id: string) => played.push(id),
        notify: (text: string) => notes.push(text),
      },
    };
  };

  it('a hotkey voice change shows a toast only when enabled', () => {
    const { store, notes, t } = targets();
    applyQuickCommand({ type: 'preset', name: 'Robot', toast: true }, t);
    expect(notes).toEqual(['Voice: Robot']);
    applyQuickCommand({ type: 'preset', name: 'Robot' }, t); // from the compact panel: silent
    expect(notes).toHaveLength(1);
    store.getState().setHotkeyToast(false);
    applyQuickCommand({ type: 'preset', name: 'Giant / Monster', toast: true }, t);
    expect(notes).toHaveLength(1);
  });

  it('quickSwitch goes there and back', () => {
    const { store, t } = targets();
    store.getState().applyPreset('Male – Deep');
    applyQuickCommand({ type: 'quickSwitch', preset: 'Cartoon / Chipmunk', on: true }, t);
    expect(store.getState().preset).toBe('Cartoon / Chipmunk');
    applyQuickCommand({ type: 'quickSwitch', preset: 'Cartoon / Chipmunk', on: false }, t);
    expect(store.getState().preset).toBe('Male – Deep');
  });

  it('mute and sound commands', () => {
    const { store, played, t } = targets();
    applyQuickCommand({ type: 'mute' }, t);
    expect(store.getState().muted).toBe(true);
    applyQuickCommand({ type: 'mute' }, t);
    expect(store.getState().muted).toBe(false);
    applyQuickCommand({ type: 'sound', id: 'abc' }, t);
    expect(played).toEqual(['abc']);
  });

  it('the state sent to panels and phones includes the soundboard and mute', () => {
    const store = createStudioStore();
    store.getState().addSound({ id: 'abc', name: 'Horn' });
    store.getState().setMuted(true);
    const state = buildQuickState({
      state: store.getState(),
      meters: { inPeak: 0 },
      music: { trackCount: 0, title: '', playing: false, progress: 0 },
      latencyMs: 0,
      dropouts: 0,
    });
    expect(state.sounds).toEqual([{ id: 'abc', name: 'Horn' }]);
    expect(state.muted).toBe(true);
  });
});
