import type { DisplayMeters } from '@engine/audio/meter-smoother';
import { CABLE_CHOSEN_KEY } from '@shared/persisted-state';
import { createHarness } from '../../helpers/fakes';

// device enumeration goes through navigator.mediaDevices
function mockDevices(list: Array<{ kind: MediaDeviceKind; deviceId: string; label: string }>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        enumerateDevices: async () => list.map((d) => ({ ...d, groupId: '', toJSON: () => ({}) })),
        getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }),
      },
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('StudioController — engine lifecycle', () => {
  it('starts the engine with the current settings', async () => {
    const h = createHarness();
    h.store.getState().setDevice('in', 'mic-1');
    h.store.getState().setDevice('out', 'cable');
    h.store.getState().setBuffer('safe');
    h.store.getState().setMusic({ vol: 40 });
    mockDevices([]);

    await h.controller.start();

    const opts = h.engine.startOptions!;
    expect(opts.workletSource).toBe('/* worklet */');
    expect(opts.inputDeviceId).toBe('mic-1');
    expect(opts.outputDeviceId).toBe('cable');
    expect(opts.latencyHint).toBe('playback');
    expect(opts.musicVolume).toBeCloseTo(0.4, 6);
    expect(opts.params).toBe(h.store.getState().params);
    expect(h.store.getState().engine).toBe('running');
    expect(h.store.getState().status).toBe('Running · 48.0 kHz');
  });

  it('maps the buffer modes to latency hints', async () => {
    for (const [mode, hint] of [
      ['low', 'interactive'],
      ['balanced', 'balanced'],
      ['safe', 'playback'],
    ] as const) {
      const h = createHarness();
      h.store.getState().setBuffer(mode);
      mockDevices([]);
      await h.controller.start();
      expect(h.engine.startOptions!.latencyHint).toBe(hint);
    }
  });

  it('reports a start failure and returns to stopped', async () => {
    const h = createHarness();
    h.engine.failStartWith = 'Permission denied';
    await h.controller.start();
    expect(h.store.getState().engine).toBe('stopped');
    expect(h.store.getState().status).toBe('Error: Permission denied');
  });

  it('ignores a second start while running or starting', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    await h.controller.start();
    expect(h.engine.start).toHaveBeenCalledTimes(1);
  });

  it('stop keeps an error message but otherwise reports "Engine stopped"', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    await h.controller.stop();
    expect(h.store.getState().engine).toBe('stopped');
    expect(h.store.getState().status).toBe('Engine stopped');

    h.engine.failStartWith = 'boom';
    await h.controller.start();
    await h.controller.stop();
    expect(h.store.getState().status).toBe('Error: boom');
  });

  it('toggle starts and stops', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.toggle();
    expect(h.engine.running).toBe(true);
    await h.controller.toggle();
    expect(h.engine.running).toBe(false);
  });

  it('input device / buffer / Windows-processing changes restart a running engine only', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.setBuffer('low'); // not running: no restart
    expect(h.engine.calls).toEqual([]);

    await h.controller.start();
    h.engine.calls.length = 0;
    await h.controller.setInputDevice('mic-2');
    expect(h.engine.calls).toEqual(['stop', 'start']);
    expect(h.engine.startOptions!.inputDeviceId).toBe('mic-2');

    h.engine.calls.length = 0;
    await h.controller.setNoiseSuppression(true);
    await h.controller.setAutoGain(true);
    expect(h.engine.calls).toEqual(['stop', 'start', 'stop', 'start']);
    expect(h.engine.startOptions!.noiseSuppression).toBe(true);
    expect(h.engine.startOptions!.autoGainControl).toBe(true);
  });

  it('changing the output device retargets live and falls back to a restart on failure', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    await h.controller.setOutputDevice('cable');
    expect(h.engine.setOutputDevice).toHaveBeenCalledWith('cable');
    expect(h.storage.getItem(CABLE_CHOSEN_KEY)).toBe('1');

    h.engine.setOutputDevice.mockRejectedValueOnce(new Error('unsupported'));
    h.engine.calls.length = 0;
    await h.controller.setOutputDevice('other');
    expect(h.engine.calls).toEqual(['stop', 'start']);
  });
});

describe('StudioController — wiring', () => {
  it('pushes parameter, monitor, volume and loop changes to the engine and player', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    const dispose = h.controller.wire();

    h.store.getState().patchVoice({ pitch: 6 });
    expect(h.engine.params!.voice.pitch).toBe(6);

    h.store.getState().setMonitor({ on: true, vol: 0.5 });
    expect(h.engine.monitor).toEqual({ on: true, vol: 0.5 });

    h.store.getState().setMusic({ vol: 25 });
    expect(h.engine.musicBus!.setVolume).toHaveBeenCalledWith(0.25);

    h.store.getState().setMusic({ loop: true });
    expect(h.player.loop).toBe(true);

    dispose();
    h.engine.setParams.mockClear();
    h.store.getState().patchVoice({ pitch: 1 });
    expect(h.engine.setParams).not.toHaveBeenCalled();
  });

  it('ducks the music while the microphone is hot and recovers afterwards', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    let now = 0;
    const meters = { latest: {} as DisplayMeters, listeners: new Set<(m: DisplayMeters) => void>() };
    const controller = new (h.controller.constructor as new (d: unknown) => typeof h.controller)({
      store: h.store,
      engine: h.engine.asEngine(),
      player: h.player,
      api: h.api,
      storage: h.storage,
      hub: {
        latest: meters.latest,
        subscribe: (l: (m: DisplayMeters) => void) => {
          meters.listeners.add(l);
          return () => meters.listeners.delete(l);
        },
      },
      now: () => now,
    });
    controller.wire();
    const emit = (inPeak: number): void => meters.listeners.forEach((l) => l({ inPeak } as DisplayMeters));

    emit(0.5);
    expect(h.engine.musicBus!.setDuck).toHaveBeenLastCalledWith(0.3, expect.any(Number));
    now = 5000;
    emit(0);
    expect(h.engine.musicBus!.setDuck).toHaveBeenLastCalledWith(1, expect.any(Number));
  });

  it('does not duck when the user turned ducking off', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    h.store.getState().setMusic({ duck: false });
    h.controller.wire();
    h.store.getState().setMusic({ duck: false });
    h.hub.subscribe(() => undefined);
    h.engine.meters = {
      inPeak: 0.9,
      outPeak: 0,
      exp: 0,
      deess: 0,
      comp: 0,
      lim: 0,
      latencySamples: 0,
      dropouts: 0,
    };
    h.hub.tick();
    expect(h.engine.musicBus!.setDuck).toHaveBeenLastCalledWith(1, expect.any(Number));
  });
});

describe('StudioController — devices', () => {
  const list = [
    { kind: 'audioinput' as const, deviceId: 'mic', label: 'Razer Mic' },
    { kind: 'audiooutput' as const, deviceId: 'spk', label: 'Speakers' },
    { kind: 'audiooutput' as const, deviceId: 'cable', label: 'CABLE Input (VB-Audio Virtual Cable)' },
  ];

  it('publishes the lists and picks the virtual cable once on first run', async () => {
    mockDevices(list);
    const h = createHarness();
    await h.controller.refreshDevices();
    expect(h.store.getState().devices.outputs.map((d) => d.deviceId)).toEqual(['spk', 'cable']);
    expect(h.store.getState().dev.out).toBe('cable');
    expect(h.storage.getItem(CABLE_CHOSEN_KEY)).toBe('1');

    // the user later chooses something else: it is not overridden again
    h.store.getState().setDevice('out', 'spk');
    await h.controller.refreshDevices();
    expect(h.store.getState().dev.out).toBe('spk');
  });

  it('does not auto-pick without device labels (no permission yet)', async () => {
    mockDevices(list.map((d) => ({ ...d, label: '' })));
    const h = createHarness();
    await h.controller.refreshDevices();
    expect(h.store.getState().dev.out).toBe('default');
    expect(h.storage.getItem(CABLE_CHOSEN_KEY)).toBeNull();
  });

  it('ensureDeviceLabels asks for the microphone once when labels are missing', async () => {
    let granted = false;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          enumerateDevices: async () =>
            list.map((d) => ({ ...d, label: granted ? d.label : '', groupId: '', toJSON: () => ({}) })),
          getUserMedia: async () => {
            granted = true;
            return { getTracks: () => [{ stop: () => undefined }] };
          },
        },
      },
    });
    const h = createHarness();
    await h.controller.ensureDeviceLabels();
    expect(granted).toBe(true);
    expect(h.store.getState().devices.hasLabels).toBe(true);
  });
});

describe('StudioController — recording and links', () => {
  it('records, then encodes a WAV and offers it for saving', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    await h.controller.toggleRecording();
    expect(h.store.getState().recording).toBe(true);
    expect(h.engine.startRecording).toHaveBeenCalled();

    await h.controller.toggleRecording();
    expect(h.store.getState().recording).toBe(false);
    expect(h.api.saveFile).toHaveBeenCalledTimes(1);
    const [name, data, filters] = (h.api.saveFile as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(name).toMatch(/^voice-studio-.*\.wav$/);
    expect((data as ArrayBuffer).byteLength).toBe(44 + 3 * 2);
    expect(filters).toEqual([{ name: 'WAV audio', extensions: ['wav'] }]);
  });

  it('does not start recording while the engine is stopped', async () => {
    const h = createHarness();
    await h.controller.toggleRecording();
    expect(h.store.getState().recording).toBe(false);
  });

  it('stopping the engine ends a running recording and saves it', async () => {
    const h = createHarness();
    mockDevices([]);
    await h.controller.start();
    await h.controller.toggleRecording();
    await h.controller.stop();
    expect(h.api.saveFile).toHaveBeenCalledTimes(1);
  });

  it('adds a downloaded link to the playlist', async () => {
    const h = createHarness(
      {},
      {
        ytFetch: vi.fn(async () => ({
          ok: true as const,
          title: 'Song',
          ext: 'm4a',
          data: new ArrayBuffer(8),
        })),
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:song');
    expect(await h.controller.addLink('https://youtu.be/x')).toBe(true);
    expect(h.player.playlist.items.map((t) => t.name)).toEqual(['Song']);
    expect(h.store.getState().status).toBe('Added: Song');
  });

  it('reports a failed link and keeps the playlist', async () => {
    const h = createHarness();
    expect(await h.controller.addLink('https://youtu.be/x')).toBe(false);
    expect(h.store.getState().status).toBe('Link error: offline');
    expect(h.player.playlist.size).toBe(0);
    expect(await h.controller.addLink('   ')).toBe(false);
  });
});
