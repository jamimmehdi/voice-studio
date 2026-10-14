import { Compressor } from '@engine/dsp/compressor';
import { DeEsser } from '@engine/dsp/deesser';
import { Expander } from '@engine/dsp/expander';
import { Limiter } from '@engine/dsp/limiter';
import { dbToLin, linToDb } from '@engine/dsp/math';
import { FS, noise, peak, rms, sine, toDb } from '../../helpers/signals';

describe('Expander (gate)', () => {
  const settings = { thresh: -40, ratio: 4, attack: 1, release: 50, hold: 10, range: 40 };

  it('attenuates material far below the threshold', () => {
    const exp = new Expander(FS);
    exp.set(settings);
    const quiet = noise(1, 0.003); // about -50 dBFS
    const out = quiet.map((x) => exp.process(x));
    expect(rms(out, 20000)).toBeLessThan(rms(quiet, 20000) * 0.3);
  });

  it('passes material above the threshold unchanged', () => {
    const exp = new Expander(FS);
    exp.set(settings);
    const loud = sine(300, 1, 0.3);
    const out = loud.map((x) => exp.process(x));
    expect(Math.abs(rms(out, 30000) / rms(loud, 30000) - 1)).toBeLessThan(0.05);
  });

  it('never reduces by more than `range` dB', () => {
    const exp = new Expander(FS);
    exp.set({ ...settings, range: 12 });
    for (const x of noise(1, 0.0005)) exp.process(x);
    expect(exp.gainReductionDb).toBeGreaterThanOrEqual(-12.0001);
  });

  it('keeps the gate open for the hold time after the signal drops', () => {
    const exp = new Expander(FS);
    exp.set({ ...settings, hold: 100, release: 10 });
    for (const x of sine(300, 0.2, 0.3)) exp.process(x);
    // 50 ms of silence is shorter than the 100 ms hold -> still fully open
    for (let i = 0; i < FS * 0.05; i++) exp.process(0);
    expect(exp.gainReductionDb).toBeCloseTo(0, 1);
  });
});

describe('DeEsser', () => {
  const settings = { freq: 7000, q: 1.2, thresh: -30, ratio: 6, range: 18, mode: 0 as const, listen: false };

  it('reduces sibilance far more than low-frequency content', () => {
    const hiss = new DeEsser(FS);
    hiss.set(settings);
    const sib = sine(7000, 1, 0.4);
    const outSib = sib.map((x) => hiss.process(x));

    const low = new DeEsser(FS);
    low.set(settings);
    const tone = sine(200, 1, 0.4);
    const outLow = tone.map((x) => low.process(x));

    expect(rms(outSib, 24000) / rms(sib, 24000)).toBeLessThan(0.5);
    expect(rms(outLow, 24000) / rms(tone, 24000)).toBeGreaterThan(0.95);
  });

  it('wide-band mode ducks low frequencies as well when sibilance is present', () => {
    const wide = new DeEsser(FS);
    wide.set({ ...settings, mode: 1 });
    const mix = sine(7000, 1, 0.4).map((x, i) => x + 0.2 * Math.sin((2 * Math.PI * 200 * i) / FS));
    const out = mix.map((x) => wide.process(x));
    expect(rms(out, 24000)).toBeLessThan(rms(mix, 24000) * 0.8);
  });

  it('listen mode returns only the sibilance band', () => {
    const d = new DeEsser(FS);
    d.set({ ...settings, listen: true });
    const out = sine(200, 0.5, 0.4).map((x) => d.process(x));
    expect(rms(out, 12000)).toBeLessThan(0.02);
  });
});

describe('Compressor', () => {
  it('static curve: unity below the knee, 1/ratio above it', () => {
    expect(Compressor.outputLevelDb(-40, -20, 4, 0)).toBeCloseTo(-40, 6);
    expect(Compressor.outputLevelDb(-8, -20, 4, 0)).toBeCloseTo(-20 + 12 / 4, 6);
  });

  it('soft knee is continuous and bounded by both regimes', () => {
    const below = Compressor.outputLevelDb(-26.1, -20, 4, 12);
    const mid = Compressor.outputLevelDb(-20, -20, 4, 12);
    const above = Compressor.outputLevelDb(-13.9, -20, 4, 12);
    expect(below).toBeCloseTo(-26.1, 0);
    expect(mid).toBeCloseTo(-21.125, 3); // -20 + (1/4 - 1) * 6^2 / (2 * 12)
    expect(above).toBeGreaterThan(-20);
  });

  it('settles at the expected output level for a steady tone', () => {
    const comp = new Compressor(FS);
    comp.set({ thresh: -20, ratio: 4, attack: 1, release: 100, knee: 0, makeup: 0, mix: 100 });
    const input = sine(500, 1, 0.5); // -6 dBFS peak
    const out = input.map((x) => comp.process(x));
    // 14 dB over the threshold -> 3.5 dB over -> -16.5 dBFS
    expect(toDb(peak(out, 30000))).toBeCloseTo(-16.5, 0);
  });

  it('applies make-up gain', () => {
    const comp = new Compressor(FS);
    comp.set({ thresh: 0, ratio: 1, attack: 1, release: 100, knee: 0, makeup: 6, mix: 100 });
    const input = sine(500, 0.5, 0.1);
    const out = input.map((x) => comp.process(x));
    expect(toDb(rms(out, 12000) / rms(input, 12000))).toBeCloseTo(6, 0);
  });

  it('a 0 % mix returns the dry signal', () => {
    const comp = new Compressor(FS);
    comp.set({ thresh: -40, ratio: 20, attack: 1, release: 100, knee: 0, makeup: 12, mix: 0 });
    const input = sine(500, 0.2, 0.5);
    const out = input.map((x) => comp.process(x));
    expect(out[5000]).toBeCloseTo(input[5000]!, 6);
  });
});

describe('Limiter', () => {
  it('never lets the output exceed the ceiling', () => {
    const lim = new Limiter(FS);
    lim.set({ ceiling: -6, release: 60 });
    const burst = new Float32Array(FS * 2);
    for (let i = 0; i < burst.length; i++) {
      const amp = i % 24000 < 100 ? 3.5 : 1.2;
      burst[i] = Math.max(-1, Math.min(1, amp * Math.sin((2 * Math.PI * 330 * i) / FS)));
    }
    const out = burst.map((x) => lim.process(x));
    expect(peak(out)).toBeLessThanOrEqual(dbToLin(-6) * 1.0005);
    expect(rms(out, 20000)).toBeGreaterThan(0.1); // not simply muted
  });

  it('is transparent (apart from delay) below the ceiling', () => {
    const lim = new Limiter(FS);
    lim.set({ ceiling: -1, release: 80 });
    const input = sine(440, 0.5, 0.2);
    const out = input.map((x) => lim.process(x));
    const d = lim.latency;
    for (let i = 2000; i < 2100; i++) expect(out[i]).toBeCloseTo(input[i - d]!, 6);
  });

  it('exposes its look-ahead (about 2 ms) as latency', () => {
    expect(new Limiter(48000).latency).toBe(97); // 96 samples look-ahead + the sample being processed
  });

  it('reports gain reduction in dB', () => {
    const lim = new Limiter(FS);
    lim.set({ ceiling: -6, release: 80 });
    for (const x of sine(440, 0.3, 1)) lim.process(x);
    expect(lim.gainReductionDb).toBeLessThan(-1);
  });
});

describe('math', () => {
  it('dbToLin and linToDb are inverse', () => {
    for (const db of [-60, -12, 0, 6]) expect(linToDb(dbToLin(db))).toBeCloseTo(db, 9);
  });
  it('linToDb floors silence instead of -Infinity', () => {
    expect(Number.isFinite(linToDb(0))).toBe(true);
  });
});
