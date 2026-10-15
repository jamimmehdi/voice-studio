import { createDefaultParams, cloneParams, mergeDeep, clamp, type StudioParams } from '@shared/params';
import {
  applyBuiltinPreset,
  applyUserPreset,
  BUILTIN_PRESETS,
  BUILTIN_PRESET_NAMES,
  QUICK_CHIPS,
  VOICE_TILES,
} from '@shared/presets';
import { createDefaultPersisted, migratePersisted, PERSIST_VERSION } from '@shared/persisted-state';
import {
  formatDb,
  formatFreq,
  formatGain,
  formatTime,
  prettyAccelerator,
  shortSigned,
  signed,
} from '@shared/format';
import { STAGES, isStageId } from '@shared/stages';

describe('params', () => {
  it('defaults are self-consistent', () => {
    const p = createDefaultParams();
    expect(p.eq.bands).toHaveLength(6);
    expect(p.eq.bands[0].type).toBe('lowshelf');
    expect(p.eq.bands[5].type).toBe('highshelf');
    expect(p.voice.quality).toBe(2048);
  });

  it('createDefaultParams returns independent objects', () => {
    const a = createDefaultParams();
    const b = createDefaultParams();
    a.eq.bands[0].gain = 9;
    expect(b.eq.bands[0].gain).toBe(0);
  });

  it('mergeDeep never mutates its inputs and replaces arrays wholesale', () => {
    const base = createDefaultParams();
    const patch = {
      voice: { pitch: 3 },
      eq: { bands: base.eq.bands.map((b) => ({ ...b, gain: 2 })) as StudioParams['eq']['bands'] },
    };
    const frozen = cloneParams(base);
    const merged = mergeDeep(base, patch);
    expect(base).toEqual(frozen);
    expect(merged.voice.pitch).toBe(3);
    expect(merged.voice.formant).toBe(0);
    expect(merged.eq.bands.every((b) => b.gain === 2)).toBe(true);
    merged.eq.bands[0].gain = 99;
    expect(patch.eq.bands[0]!.gain).toBe(2);
  });

  it('mergeDeep ignores undefined patch values', () => {
    const merged = mergeDeep(createDefaultParams(), { voice: { pitch: undefined } });
    expect(merged.voice.pitch).toBe(0);
  });

  it('clamp bounds a value', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('presets', () => {
  it('every built-in preset keeps values inside the UI ranges', () => {
    for (const name of BUILTIN_PRESET_NAMES) {
      const applied = applyBuiltinPreset(createDefaultParams(), name);
      expect(applied, name).not.toBeNull();
      const p = applied!;
      expect(Math.abs(p.voice.pitch), name).toBeLessThanOrEqual(12);
      expect(Math.abs(p.voice.formant), name).toBeLessThanOrEqual(12);
      expect(p.eq.bands, name).toHaveLength(6);
      for (const b of p.eq.bands) {
        expect(Math.abs(b.gain), name).toBeLessThanOrEqual(18);
        expect(b.freq, name).toBeGreaterThanOrEqual(20);
        expect(b.freq, name).toBeLessThanOrEqual(20000);
        expect(b.q, name).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it('applying a preset keeps the tuned studio chain and the quality setting', () => {
    const current = createDefaultParams();
    current.hpf.freq = 150;
    current.exp.thresh = -70;
    current.inGain = 4;
    current.voice.quality = 1024;
    const next = applyBuiltinPreset(current, 'Female – Natural')!;
    expect(next.hpf.freq).toBe(150);
    expect(next.exp.thresh).toBe(-70);
    expect(next.inGain).toBe(4);
    expect(next.voice.quality).toBe(1024);
    expect(next.voice.pitch).toBe(4.5);
    expect(next.voice.formant).toBe(2.8);
  });

  it('a preset can override chain settings (Male – Strong tightens the compressor)', () => {
    const next = applyBuiltinPreset(createDefaultParams(), 'Male – Strong / Very Manly')!;
    expect(next.comp.ratio).toBe(4);
    expect(next.deess.ratio).toBe(5);
  });

  it('unknown presets return null; user presets restore everything but bypass', () => {
    expect(applyBuiltinPreset(createDefaultParams(), 'nope')).toBeNull();
    const saved = createDefaultParams();
    saved.voice.pitch = -3;
    saved.bypass = true;
    const restored = applyUserPreset(saved);
    expect(restored.voice.pitch).toBe(-3);
    expect(restored.bypass).toBe(false);
  });

  it('voice tiles and quick chips only reference real presets', () => {
    for (const t of VOICE_TILES) expect(BUILTIN_PRESETS[t.key], t.key).toBeDefined();
    for (const c of QUICK_CHIPS) expect(BUILTIN_PRESETS[c.key], c.key).toBeDefined();
    expect(QUICK_CHIPS).toHaveLength(8);
  });
});

describe('persisted state migration', () => {
  it('garbage becomes defaults', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) {
      const { state } = migratePersisted(raw);
      expect(state.params).toEqual(createDefaultParams());
      expect(state.stage).toBe('voice');
    }
  });

  it('keeps a current-format state intact', () => {
    const saved = createDefaultPersisted();
    saved.params.voice.pitch = 7;
    saved.dev.out = 'cable-id';
    saved.music.show = true;
    saved.preset = null;
    const { state, migrated } = migratePersisted(JSON.parse(JSON.stringify(saved)));
    expect(migrated).toBe(false);
    expect(state.params.voice.pitch).toBe(7);
    expect(state.dev.out).toBe('cable-id');
    expect(state.music.show).toBe(true);
    expect(state.preset).toBeNull();
  });

  it('drops parameter sets from versions before the 2.0 defaults but keeps devices', () => {
    const { state, migrated } = migratePersisted({
      params: { voice: { pitch: 9 }, exp: { thresh: -52 } },
      dev: { in: 'mic', out: 'cable', mon: 'hp' },
      preset: 'Robot',
    });
    expect(migrated).toBe(true);
    expect(state.params).toEqual(createDefaultParams());
    expect(state.dev).toEqual({ in: 'mic', out: 'cable', mon: 'hp' });
    expect(state.preset).toBe('Robot');
  });

  it('sanitises wrong types and out-of-range values', () => {
    const { state } = migratePersisted({
      v: PERSIST_VERSION,
      monitor: { on: 'yes', vol: 7 },
      music: { vol: -5, duck: 'no', show: 1 },
      buffer: 'turbo',
      stage: 'nonsense',
      params: { voice: { pitch: 2 } },
    });
    expect(state.monitor).toEqual({ on: false, vol: 1 });
    expect(state.music.vol).toBe(0);
    expect(state.music.duck).toBe(true);
    expect(state.music.show).toBe(false);
    expect(state.buffer).toBe('balanced');
    expect(state.stage).toBe('voice');
    expect(state.params.voice.pitch).toBe(2);
    expect(state.params.hpf).toEqual(createDefaultParams().hpf);
  });
});

describe('format helpers', () => {
  it('signed uses a typographic minus', () => {
    expect(signed(4.5)).toBe('+4.5');
    expect(signed(-2)).toBe('−2.0');
    expect(signed(0)).toBe('+0.0');
  });
  it('shortSigned drops trailing zeros and the sign of zero', () => {
    expect(shortSigned(4.5)).toBe('+4.5');
    expect(shortSigned(-4)).toBe('−4');
    expect(shortSigned(0)).toBe('0');
  });
  it('formatFreq switches to kHz', () => {
    expect(formatFreq(80)).toBe('80 Hz');
    expect(formatFreq(6500)).toBe('6.5 kHz');
  });
  it('formatDb shows silence as −∞', () => {
    expect(formatDb(-14.23)).toBe('−14.2');
    expect(formatDb(-120)).toBe('−∞');
    expect(formatDb(Number.NEGATIVE_INFINITY)).toBe('−∞');
  });
  it('formatGain and formatTime', () => {
    expect(formatGain(0)).toBe('0.0 dB');
    expect(formatGain(-3.25)).toBe('−3.3 dB');
    expect(formatTime(72.4)).toBe('1:12');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
  it('prettyAccelerator', () => {
    expect(prettyAccelerator('Control+Alt+V')).toBe('Ctrl + Alt + V');
  });
});

describe('stages', () => {
  it('has eleven unique stages and validates ids', () => {
    expect(STAGES).toHaveLength(11);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(11);
    expect(isStageId('voice')).toBe(true);
    expect(isStageId('bogus')).toBe(false);
    expect(isStageId(7)).toBe(false);
  });
});
