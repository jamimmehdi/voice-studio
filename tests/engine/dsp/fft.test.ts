import { FFT } from '@engine/dsp/fft';

describe('FFT', () => {
  it('inverse(forward(x)) reproduces x', () => {
    const fft = new FFT(1024);
    const re = new Float64Array(1024).map((_, i) => Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.9));
    const im = new Float64Array(1024);
    const original = Float64Array.from(re);
    fft.forward(re, im);
    fft.inverse(re, im);
    for (let i = 0; i < 1024; i++) expect(re[i]).toBeCloseTo(original[i]!, 9);
  });

  it('an impulse has a flat magnitude spectrum', () => {
    const fft = new FFT(256);
    const re = new Float64Array(256);
    const im = new Float64Array(256);
    re[0] = 1;
    fft.forward(re, im);
    for (let k = 0; k < 256; k++) expect(Math.hypot(re[k]!, im[k]!)).toBeCloseTo(1, 9);
  });

  it('puts a sine into the expected bin', () => {
    const N = 512;
    const bin = 37;
    const fft = new FFT(N);
    const re = new Float64Array(N).map((_, i) => Math.cos((2 * Math.PI * bin * i) / N));
    const im = new Float64Array(N);
    fft.forward(re, im);
    let best = 0;
    for (let k = 1; k < N / 2; k++)
      if (Math.hypot(re[k]!, im[k]!) > Math.hypot(re[best]!, im[best]!)) best = k;
    expect(best).toBe(bin);
    expect(Math.hypot(re[bin]!, im[bin]!)).toBeCloseTo(N / 2, 6);
  });

  it('rejects sizes that are not a power of two', () => {
    expect(() => new FFT(1000)).toThrow(RangeError);
    expect(() => new FFT(1)).toThrow(RangeError);
  });
});
