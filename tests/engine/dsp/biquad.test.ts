import { Biquad, biquadCoeffs, biquadMagnitudeDb, IDENTITY_COEFFS } from '@engine/dsp/biquad';
import { FS, rms, sine, toDb } from '../../helpers/signals';

describe('biquadCoeffs / biquadMagnitudeDb', () => {
  it('identity coefficients have a flat 0 dB response', () => {
    for (const f of [50, 1000, 12000]) expect(biquadMagnitudeDb(IDENTITY_COEFFS, FS, f)).toBeCloseTo(0, 6);
  });

  it('high-pass: -3 dB at the corner (Butterworth Q) and steep below it', () => {
    const c = biquadCoeffs('highpass', FS, 1000, 0.7071);
    expect(biquadMagnitudeDb(c, FS, 1000)).toBeCloseTo(-3, 0);
    expect(biquadMagnitudeDb(c, FS, 100)).toBeLessThan(-30);
    expect(biquadMagnitudeDb(c, FS, 10000)).toBeCloseTo(0, 0);
  });

  it('low-pass mirrors the high-pass', () => {
    const c = biquadCoeffs('lowpass', FS, 1000, 0.7071);
    expect(biquadMagnitudeDb(c, FS, 100)).toBeCloseTo(0, 0);
    expect(biquadMagnitudeDb(c, FS, 10000)).toBeLessThan(-30);
  });

  it('peaking filter reaches exactly its gain at the centre frequency', () => {
    for (const gain of [-12, -3, 6, 15]) {
      const c = biquadCoeffs('peaking', FS, 2000, 1.2, gain);
      expect(biquadMagnitudeDb(c, FS, 2000)).toBeCloseTo(gain, 1);
    }
  });

  it('shelves settle to their gain far from the corner', () => {
    const low = biquadCoeffs('lowshelf', FS, 200, 0.7, 6);
    expect(biquadMagnitudeDb(low, FS, 20)).toBeCloseTo(6, 0);
    expect(biquadMagnitudeDb(low, FS, 8000)).toBeCloseTo(0, 0);
    const high = biquadCoeffs('highshelf', FS, 5000, 0.7, -9);
    expect(biquadMagnitudeDb(high, FS, 20000)).toBeCloseTo(-9, 0);
    expect(biquadMagnitudeDb(high, FS, 100)).toBeCloseTo(0, 0);
  });

  it('band-pass has unity gain at its centre', () => {
    const c = biquadCoeffs('bandpass', FS, 6500, 1.2);
    expect(biquadMagnitudeDb(c, FS, 6500)).toBeCloseTo(0, 1);
    expect(biquadMagnitudeDb(c, FS, 200)).toBeLessThan(-20);
  });

  it('clamps absurd frequencies instead of producing NaN', () => {
    const c = biquadCoeffs('peaking', FS, 1e9, 1, 6);
    expect(c.every(Number.isFinite)).toBe(true);
  });
});

describe('Biquad.process', () => {
  it('matches the analytic magnitude response on a steady sine', () => {
    const coeffs = biquadCoeffs('peaking', FS, 1000, 1, 9);
    const filter = new Biquad();
    filter.set(coeffs);
    const input = sine(1000, 0.5, 0.2);
    const out = input.map((x) => filter.process(x));
    const measured = toDb(rms(out, 12000) / rms(input, 12000));
    expect(measured).toBeCloseTo(9, 0);
  });

  it('reset clears the state', () => {
    const f = new Biquad();
    f.set(biquadCoeffs('lowpass', FS, 500, 0.7071));
    f.process(1);
    f.process(1);
    f.reset();
    expect(f.process(0)).toBe(0);
  });
});
