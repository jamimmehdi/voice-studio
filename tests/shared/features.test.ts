import {
  NOISE_LEVEL_AMOUNT,
  blockLevelsDb,
  describeNoise,
  detectPitchFrame,
  estimatePitch,
  levelStats,
  noiseLevelFor,
  suggestFemaleVoice,
  suggestGateThreshold,
  suggestInputGain,
  suggestNoiseLevel,
} from '@shared/calibration';
import { countProblems, runDiagnostics, type DiagnosticInput } from '@shared/diagnostics';
import { appNameFromExe, createDefaultHotkeys, createDefaultProfiles, findProfile } from '@shared/features';
import { createDefaultParams } from '@shared/params';
import { createDefaultPersisted, migratePersisted, PERSIST_VERSION } from '@shared/persisted-state';
import { exportVsp, parseCommunity, parseVsp } from '@shared/vsp';
import { FS, harmonics, noise, sine } from '../helpers/signals';

describe('calibration: levels', () => {
  it('suggestInputGain brings loud speech to −14 dB and stays inside ±range', () => {
    expect(suggestInputGain(-14)).toBe(0);
    expect(suggestInputGain(-20)).toBe(6);
    expect(suggestInputGain(-3)).toBe(-11);
    expect(suggestInputGain(-60)).toBe(18);
    expect(suggestInputGain(5)).toBe(-12);
  });

  it('gate threshold sits above the noise but never above quiet speech', () => {
    expect(suggestGateThreshold(-70, -14)).toBe(-62);
    expect(suggestGateThreshold(-90, -14)).toBe(-75); // floor
    expect(suggestGateThreshold(-30, -22)).toBe(-42); // ceiling: speech - 20
    expect(suggestGateThreshold(-10, 0)).toBe(-35); // never above −35
  });

  it('describes and ranks background noise', () => {
    expect(describeNoise(-70).verdict).toBe('quiet');
    expect(describeNoise(-50).verdict).toBe('hum');
    expect(describeNoise(-30).verdict).toBe('noisy');
    expect(suggestNoiseLevel(-70)).toBe('Light');
    expect(suggestNoiseLevel(-50)).toBe('Medium');
    expect(suggestNoiseLevel(-30)).toBe('Strong');
  });

  it('noiseLevelFor only matches the three preset amounts', () => {
    expect(noiseLevelFor(NOISE_LEVEL_AMOUNT.Medium)).toBe('Medium');
    expect(noiseLevelFor(55)).toBeNull();
  });

  it('levelStats separates speech from the noise floor', () => {
    const blocks = [...new Array<number>(20).fill(-60), ...new Array<number>(10).fill(-15)];
    const stats = levelStats(blocks);
    expect(stats.noiseDb).toBe(-60);
    expect(stats.speechDb).toBe(-15);
  });

  it('blockLevelsDb measures RMS per block', () => {
    const tone = sine(440, 0.5, 0.5);
    const levels = blockLevelsDb(tone, 2400);
    expect(levels.length).toBe(10);
    for (const l of levels) expect(l).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 0);
    expect(levelStats([]).speechDb).toBe(-120);
  });
});

describe('calibration: pitch', () => {
  it('finds the fundamental of a voiced frame', () => {
    const f0 = 118;
    const frame = harmonics(f0, 0.1, 0.2).subarray(0, Math.round(FS * 0.04));
    const found = detectPitchFrame(frame, FS);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - f0)).toBeLessThan(3);
  });

  it('rejects silence and noise', () => {
    expect(detectPitchFrame(new Float32Array(1920), FS)).toBeNull();
    expect(detectPitchFrame(noise(0.04, 0.3), FS)).toBeNull();
  });

  it('estimatePitch returns the median over a recording and null without speech', () => {
    const recording = harmonics(205, 1.5, 0.2);
    const hz = estimatePitch(recording, FS);
    expect(hz).not.toBeNull();
    expect(Math.abs(hz! - 205)).toBeLessThan(4);
    expect(estimatePitch(noise(1, 0.01), FS)).toBeNull();
    expect(estimatePitch(new Float32Array(100), FS)).toBeNull();
  });

  it('suggestFemaleVoice matches the board example and stays in range', () => {
    expect(suggestFemaleVoice(118)).toEqual({ pitch: 5, formant: 3 });
    const low = suggestFemaleVoice(70);
    expect(low.pitch).toBeLessThanOrEqual(12);
    const high = suggestFemaleVoice(400);
    expect(high.pitch).toBeGreaterThanOrEqual(-12);
    expect(suggestFemaleVoice(158).pitch).toBe(0);
  });
});

describe('diagnostics', () => {
  const healthy: DiagnosticInput = {
    engineRunning: true,
    inputPeak: 0.3,
    inputLabel: 'Headset',
    latencyMs: 43,
    dropouts: 0,
    cableFound: true,
    outputIsCable: true,
    outputLabel: 'CABLE Input',
  };

  it('reports no problems when everything is in place', () => {
    const results = runDiagnostics(healthy);
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(0);
    expect(countProblems(results)).toEqual({ problems: 0, fixable: 0 });
    expect(results.find((r) => r.id === 'game')?.status).toBe('info');
  });

  it('finds a stopped engine, a missing cable and a wrong output', () => {
    const stopped = runDiagnostics({ ...healthy, engineRunning: false });
    expect(stopped.find((r) => r.id === 'engine')).toMatchObject({
      status: 'fail',
      fix: { action: 'start-engine' },
    });
    expect(stopped.find((r) => r.id === 'mic')?.status).toBe('info');

    const noCable = runDiagnostics({ ...healthy, cableFound: false, outputIsCable: false });
    expect(noCable.find((r) => r.id === 'cable')?.fix?.action).toBe('install-cable');
    expect(noCable.find((r) => r.id === 'output')).toBeUndefined();

    const wrong = runDiagnostics({ ...healthy, outputIsCable: false, outputLabel: 'Speakers (Realtek)' });
    const out = wrong.find((r) => r.id === 'output')!;
    expect(out.status).toBe('fail');
    expect(out.detail).toContain('Speakers (Realtek)');
    expect(out.fix?.action).toBe('use-cable');
    expect(countProblems(wrong)).toEqual({ problems: 1, fixable: 1 });
  });

  it('flags a silent microphone while the engine runs', () => {
    const silent = runDiagnostics({ ...healthy, inputPeak: 0.00001 });
    expect(silent.find((r) => r.id === 'mic')).toMatchObject({
      status: 'fail',
      fix: { action: 'open-devices' },
    });
  });
});

describe('.vsp voice files', () => {
  it('round-trips voices', () => {
    const a = createDefaultParams();
    a.voice.pitch = 6;
    a.fx = { on: true, character: 'radio', reverb: 20, echo: 0, chorus: 5 };
    const text = exportVsp({ 'Anime girl': a });
    const parsed = parseVsp(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.voices).toHaveLength(1);
    expect(parsed.voices[0]!.name).toBe('Anime girl');
    expect(parsed.voices[0]!.params.voice.pitch).toBe(6);
    expect(parsed.voices[0]!.params.fx.character).toBe('radio');
  });

  it('rejects files that are not voices', () => {
    expect(parseVsp('not json').ok).toBe(false);
    expect(parseVsp('{"app":"other","voices":[]}').ok).toBe(false);
    expect(parseVsp(JSON.stringify({ app: 'voice-studio', v: 1, voices: [] })).ok).toBe(false);
  });

  it('sanitises names, drops unknown keys and fills missing settings', () => {
    const hostile = JSON.stringify({
      app: 'voice-studio',
      v: 1,
      voices: [
        {
          name: '  Evil\u0000 name  '.padEnd(200, 'x'),
          params: { voice: { pitch: 3 }, extra: { boom: true } },
        },
        { name: '', params: {} },
        { name: 'no params' },
      ],
    });
    const parsed = parseVsp(hostile);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.voices).toHaveLength(1);
    const v = parsed.voices[0]!;
    expect(v.name).not.toContain('\u0000');
    expect(v.name.length).toBeLessThanOrEqual(60);
    expect(v.params.voice.pitch).toBe(3);
    expect(v.params.voice.quality).toBe(2048);
    expect(v.params.bypass).toBe(false);
    expect(Object.keys(v.params)).not.toContain('extra');
  });

  it('parses the community list defensively', () => {
    const text = JSON.stringify({
      voices: [
        { name: 'Radio host', author: 'jamim', description: 'Warm', params: { voice: { pitch: -3 } } },
        { name: 5, params: {} },
        { name: 'Broken' },
      ],
    });
    const list = parseCommunity(text);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Radio host', author: 'jamim' });
    expect(parseCommunity('nope')).toEqual([]);
    expect(parseCommunity('{}')).toEqual([]);
  });
});

describe('profiles helpers', () => {
  it('finds a profile by executable, ignoring case', () => {
    const apps = [{ exe: 'valorant-win64-shipping.exe', name: 'Valorant', preset: 'Robot', start: true }];
    expect(findProfile(apps, 'VALORANT-Win64-Shipping.exe')?.name).toBe('Valorant');
    expect(findProfile(apps, 'chrome.exe')).toBeNull();
    expect(findProfile(apps, null)).toBeNull();
    expect(appNameFromExe('Game.EXE')).toBe('Game');
  });
});

describe('persisted state: 2.1 fields', () => {
  it('defaults are empty and auto buffer is on', () => {
    const d = createDefaultPersisted();
    expect(d.autoBuffer).toBe(true);
    expect(d.profiles).toEqual(createDefaultProfiles());
    expect(d.hotkeys).toEqual(createDefaultHotkeys());
    expect(d.sounds).toEqual([]);
    expect(d.setupDone).toBe(false);
  });

  it('an existing user (stored state without setupDone) is not sent through the wizard', () => {
    const { state } = migratePersisted({ v: PERSIST_VERSION, params: {} });
    expect(state.setupDone).toBe(true);
    expect(migratePersisted(null).state.setupDone).toBe(false);
  });

  it('sanitises profiles, hotkeys and sounds', () => {
    const { state } = migratePersisted({
      v: PERSIST_VERSION,
      profiles: {
        enabled: 'yes',
        fallback: 'Robot',
        apps: [
          { exe: 'Game.EXE', name: 'Game', preset: 'Giant / Monster', start: true },
          { exe: '', name: 'bad' },
          'junk',
        ],
      },
      hotkeys: {
        voices: { Robot: 'Control+Alt+1', Bad: 12 },
        quick: { preset: 'Robot', accelerator: 'Control+Alt+9' },
        toast: false,
      },
      sounds: [{ id: 'a1b2c3d4e5f60718', name: 'Airhorn' }, { id: '../etc', name: 'evil' }, { id: 'x' }],
      soundOptions: { duckVoice: false, volume: 500 },
      autoBuffer: false,
    });
    expect(state.profiles.enabled).toBe(false);
    expect(state.profiles.fallback).toBe('Robot');
    expect(state.profiles.apps).toEqual([
      { exe: 'game.exe', name: 'Game', preset: 'Giant / Monster', start: true },
    ]);
    expect(state.hotkeys.voices).toEqual({ Robot: 'Control+Alt+1' });
    expect(state.hotkeys.quick).toEqual({ preset: 'Robot', accelerator: 'Control+Alt+9' });
    expect(state.hotkeys.toast).toBe(false);
    expect(state.sounds).toEqual([{ id: 'a1b2c3d4e5f60718', name: 'Airhorn' }]);
    expect(state.soundOptions).toEqual({ duckVoice: false, volume: 100 });
    expect(state.autoBuffer).toBe(false);
  });
});
