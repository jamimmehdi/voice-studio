import { meterPercent, MeterSmoother } from '@engine/audio/meter-smoother';
import {
  KNOB_END_DEG,
  KNOB_START_DEG,
  angleFor,
  arcPath,
  dragValue,
  formatKnobValue,
  fromNorm,
  isBipolar,
  polar,
  quantize,
  toNorm,
  wheelValue,
} from '@renderer/lib/knob-math';
import { NATURAL_FORMANT_RATIO, padPosition, padValue } from '@renderer/lib/pad-math';
import {
  SCOPE_BARS,
  dbToY,
  freqToX,
  hitHandle,
  idleBars,
  spectrumBars,
  xToFreq,
  yToDb,
} from '@renderer/lib/scope-math';
import { acceleratorFromEvent, keyNameFromCode } from '@renderer/studio/lib/accelerator';
import { selectedDeviceLabel, stageSummary } from '@renderer/studio/lib/stage-summary';
import { createDefaultParams } from '@shared/params';

describe('knob-math', () => {
  const linear = { min: -12, max: 12, step: 0.1 };
  const log = { min: 20, max: 20000, log: true };

  it('maps values to 0..1 and back (linear and logarithmic)', () => {
    expect(toNorm(linear, -12)).toBe(0);
    expect(toNorm(linear, 12)).toBe(1);
    expect(toNorm(linear, 0)).toBeCloseTo(0.5, 9);
    expect(toNorm(log, 20)).toBeCloseTo(0, 9);
    expect(toNorm(log, 20000)).toBeCloseTo(1, 9);
    expect(toNorm(log, 632.4555)).toBeCloseTo(0.5, 3); // geometric centre
    for (const n of [0, 0.25, 0.7, 1]) {
      expect(toNorm(log, fromNorm(log, n))).toBeCloseTo(n, 9);
      expect(toNorm(linear, fromNorm(linear, n))).toBeCloseTo(n, 9);
    }
  });

  it('clamps out-of-range input', () => {
    expect(toNorm(linear, 99)).toBe(1);
    expect(fromNorm(linear, 7)).toBe(12);
    expect(fromNorm(linear, -3)).toBe(-12);
  });

  it('quantizes to the step without floating point noise', () => {
    expect(quantize(linear, 0.30000000000000004)).toBe(0.3);
    expect(quantize(linear, 4.449)).toBe(4.4);
    expect(quantize(linear, 50)).toBe(12);
    expect(quantize({ min: 0, max: 1 }, 0.123456)).toBeCloseTo(0.123456, 9);
  });

  it('knows which ranges are bipolar', () => {
    expect(isBipolar(linear)).toBe(true);
    expect(isBipolar({ min: 0, max: 100 })).toBe(false);
    expect(isBipolar({ min: 20, max: 20000, log: true })).toBe(false);
  });

  it('angle spans the whole travel', () => {
    expect(angleFor(linear, -12)).toBe(KNOB_START_DEG);
    expect(angleFor(linear, 12)).toBe(KNOB_END_DEG);
    expect(angleFor(linear, 0)).toBeCloseTo(0, 9);
  });

  it('polar / arcPath produce sane geometry', () => {
    const [x, y] = polar(32, 32, 10, 0);
    expect(x).toBeCloseTo(32, 9);
    expect(y).toBeCloseTo(22, 9);
    expect(arcPath(32, 32, 24, -135, 135)).toMatch(/^M[\d. ]+ A24 24 0 1 1 [\d. ]+$/);
    expect(arcPath(32, 32, 24, 0, 90)).toMatch(/ 0 0 1 /); // short arc: large-arc flag 0
  });

  it('formats values with units, decimals, kHz and a typographic minus', () => {
    expect(formatKnobValue({ min: -18, max: 18, unit: ' dB' }, -3)).toBe('−3.0 dB');
    expect(formatKnobValue({ min: 20, max: 20000, unit: ' Hz' }, 1100)).toBe('1.10 kHz');
    expect(formatKnobValue({ min: 20, max: 500, unit: ' Hz', dec: 0 }, 80)).toBe('80 Hz');
    expect(formatKnobValue({ min: 0, max: 100, unit: ' %', dec: 0 }, 100)).toBe('100 %');
    expect(formatKnobValue({ min: 0, max: 400 }, 150)).toBe('150');
  });

  it('dragging up increases, down decreases; shift is ten times finer', () => {
    const coarse = dragValue(linear, 0, 18, false);
    const fine = dragValue(linear, 0, 18, true);
    expect(coarse).toBeGreaterThan(0);
    expect(fine).toBeGreaterThan(0);
    expect(fine).toBeLessThan(coarse);
    expect(dragValue(linear, 0, -18, false)).toBeLessThan(0);
    expect(dragValue(linear, 11.9, 500, false)).toBe(12);
  });

  it('wheel steps by 2 % of the travel (0.5 % with shift)', () => {
    expect(wheelValue(linear, 0, -1, false)).toBeCloseTo(0.5, 1); // 0.02 * 24 = 0.48 -> 0.5
    expect(wheelValue(linear, 0, 1, false)).toBeCloseTo(-0.5, 1);
    expect(wheelValue(linear, 0, -1, true)).toBeCloseTo(0.1, 1);
  });
});

describe('pad-math', () => {
  it('centre is the middle of the pad', () => {
    expect(padPosition(0, 0)).toEqual({ x: 50, y: 50 });
  });

  it('higher pitch moves right, larger formant moves up', () => {
    expect(padPosition(12, 0).x).toBe(100);
    expect(padPosition(-12, 0).x).toBe(0);
    expect(padPosition(0, 12).y).toBe(0);
    expect(padPosition(0, -12).y).toBe(100);
  });

  it('clamps values beyond ±12', () => {
    expect(padPosition(40, -40)).toEqual({ x: 100, y: 100 });
  });

  it('pointer position -> semitones round trip', () => {
    const p = padPosition(4.5, 2.8);
    const v = padValue(p.x / 100, p.y / 100, false);
    expect(v.pitch).toBeCloseTo(4.5, 1);
    expect(v.formant).toBeCloseTo(2.8, 1);
  });

  it('shift snaps the formant to the natural diagonal', () => {
    const v = padValue(0.9, 0.9, true);
    expect(v.pitch).toBe(9.6);
    expect(v.formant).toBe(Math.round(9.6 * NATURAL_FORMANT_RATIO * 10) / 10);
  });

  it('clamps pointer positions outside the pad', () => {
    expect(padValue(-1, 2, false)).toEqual({ pitch: -12, formant: -12 });
    expect(padValue(2, -1, false)).toEqual({ pitch: 12, formant: 12 });
  });
});

describe('scope-math', () => {
  it('frequency <-> x is logarithmic and invertible', () => {
    expect(freqToX(20, 1000)).toBeCloseTo(0, 6);
    expect(freqToX(20000, 1000)).toBeCloseTo(1000, 6);
    expect(freqToX(632.455, 1000)).toBeCloseTo(500, 1);
    for (const f of [50, 440, 3000, 15000]) expect(xToFreq(freqToX(f, 640), 640)).toBeCloseTo(f, 6);
  });

  it('dB <-> y puts 0 dB in the middle', () => {
    expect(dbToY(0, 200)).toBe(100);
    expect(dbToY(22, 200)).toBe(0);
    expect(dbToY(-22, 200)).toBe(200);
    expect(yToDb(dbToY(6.5, 130), 130)).toBeCloseTo(6.5, 9);
  });

  it('hit-testing picks the nearest handle inside the radius', () => {
    const handles = [
      { index: 0, x: 50, y: 50 },
      { index: 1, x: 60, y: 52 },
    ];
    expect(hitHandle(handles, 58, 52)?.index).toBe(1);
    expect(hitHandle(handles, 51, 50)?.index).toBe(0);
    expect(hitHandle(handles, 200, 200)).toBeNull();
  });

  it('collapses an analyser spectrum into bounded bar levels', () => {
    const data = new Float32Array(2048).fill(-100);
    for (let i = 20; i < 40; i++) data[i] = -20;
    const bars = spectrumBars(data, 48000 / 4096);
    expect(bars).toHaveLength(SCOPE_BARS);
    expect(bars.every((b) => b >= 0 && b <= 1)).toBe(true);
    expect(Math.max(...bars)).toBeCloseTo(0.8, 5);
    expect(Math.min(...bars)).toBe(0);
    expect(idleBars()).toHaveLength(SCOPE_BARS);
  });
});

describe('MeterSmoother', () => {
  const raw = (
    over: Partial<Record<'inPeak' | 'outPeak' | 'exp' | 'deess' | 'comp' | 'lim', number>> = {},
  ) => ({
    inPeak: 0,
    outPeak: 0,
    exp: 0,
    deess: 0,
    comp: 0,
    lim: 0,
    ...over,
  });

  it('attacks instantly and falls exponentially', () => {
    const s = new MeterSmoother();
    expect(s.update(raw({ inPeak: 0.8 }), 0).inPeak).toBe(0.8);
    expect(s.update(raw(), 33).inPeak).toBeCloseTo(0.72, 6);
    expect(s.update(raw(), 66).inPeak).toBeCloseTo(0.648, 6);
  });

  it('gain reduction follows the deepest recent value then relaxes toward 0', () => {
    const s = new MeterSmoother();
    expect(s.update(raw({ comp: -12 }), 0).comp).toBe(-12);
    expect(s.update(raw(), 33).comp).toBeCloseTo(-10.8, 6);
  });

  it('holds the peak marker for ~1.2 s', () => {
    const s = new MeterSmoother();
    const first = s.update(raw({ inPeak: 1 }), 0);
    expect(first.inHoldDb).toBeCloseTo(0, 6);
    const later = s.update(raw(), 500);
    expect(later.inHoldDb).toBeCloseTo(0, 6); // still held
    const expired = s.update(raw(), 1500);
    expect(expired.inHoldDb).toBeLessThan(-1); // released to the (decayed) current level
  });

  it('decays when the engine stops (null input)', () => {
    const s = new MeterSmoother();
    s.update(raw({ outPeak: 1 }), 0);
    expect(s.update(null, 33).outPeak).toBeCloseTo(0.9, 6);
  });

  it('maps dB to a percentage of the −60..0 scale', () => {
    expect(meterPercent(-60)).toBe(0);
    expect(meterPercent(0)).toBe(100);
    expect(meterPercent(-30)).toBe(50);
    expect(meterPercent(-90)).toBe(0);
    expect(meterPercent(6)).toBe(100);
  });
});

describe('accelerator capture', () => {
  const ev = (
    over: Partial<KeyboardEvent>,
  ): Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'> => ({
    key: 'v',
    code: 'KeyV',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...over,
  });

  it('builds an Electron accelerator from modifiers and a key', () => {
    expect(acceleratorFromEvent(ev({ ctrlKey: true, altKey: true }))).toEqual({
      kind: 'ok',
      accelerator: 'Control+Alt+V',
    });
    expect(acceleratorFromEvent(ev({ shiftKey: true, key: 'F5', code: 'F5' }))).toEqual({
      kind: 'ok',
      accelerator: 'Shift+F5',
    });
  });

  it('waits while only a modifier is held', () => {
    expect(acceleratorFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toEqual({
      kind: 'wait',
    });
  });

  it('rejects a bare key and unknown keys', () => {
    expect(acceleratorFromEvent(ev({})).kind).toBe('invalid');
    expect(acceleratorFromEvent(ev({ ctrlKey: true, code: 'IntlBackslash' })).kind).toBe('invalid');
  });

  it('maps key codes', () => {
    expect(keyNameFromCode('Digit7')).toBe('7');
    expect(keyNameFromCode('ArrowUp')).toBe('Up');
    expect(keyNameFromCode('Nope')).toBeNull();
  });
});

describe('stage summaries', () => {
  const ctx = (mutate: (p: ReturnType<typeof createDefaultParams>) => void = () => undefined) => {
    const params = createDefaultParams();
    mutate(params);
    return {
      params,
      inputLabel: 'Headset Microphone (Razer Audio Controller)',
      outputLabel: 'CABLE Input (VB-Audio Virtual Cable)',
    };
  };

  it('describes every stage', () => {
    expect(stageSummary('mic', ctx())).toBe('Headset Microphone');
    expect(stageSummary('hpf', ctx())).toBe('80 Hz · 24 dB');
    expect(stageSummary('exp', ctx())).toBe('−58 dB · 2.0:1');
    expect(stageSummary('deess', ctx())).toBe('6.5 kHz · 4.0:1');
    expect(stageSummary('eq', ctx())).toBe('6 bands');
    expect(stageSummary('comp', ctx())).toBe('−20 dB · 3.0:1');
    expect(stageSummary('lim', ctx())).toBe('ceiling −1.0 dB');
    expect(stageSummary('out', ctx())).toBe('CABLE Input');
  });

  it('shows the voice shift or "off"', () => {
    expect(
      stageSummary(
        'voice',
        ctx((p) => {
          p.voice.pitch = 4.5;
          p.voice.formant = -2;
        }),
      ),
    ).toBe('+4.5 · −2.0 st');
    expect(
      stageSummary(
        'voice',
        ctx((p) => {
          p.voice.on = false;
        }),
      ),
    ).toBe('off');
  });

  it('counts only enabled EQ bands', () => {
    expect(
      stageSummary(
        'eq',
        ctx((p) => {
          p.eq.bands[1].on = false;
          p.eq.bands[4].on = false;
        }),
      ),
    ).toBe('4 bands');
  });

  it('resolves the selected device label', () => {
    const list = [{ deviceId: 'a', label: 'Mic A' }];
    expect(selectedDeviceLabel(list, 'a')).toBe('Mic A');
    expect(selectedDeviceLabel(list, 'default')).toBe('System default');
    expect(selectedDeviceLabel(list, 'gone')).toBe('System default');
  });
});
