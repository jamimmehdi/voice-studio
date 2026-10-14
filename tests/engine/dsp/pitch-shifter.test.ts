import { PitchShifter } from '@engine/dsp/pitch-shifter';
import { dominantFrequency, FS, fundamental, harmonics, rms, vowel } from '../../helpers/signals';

function shift(size: number, pitch: number, formant: number, input: Float32Array): Float32Array {
  const shifter = new PitchShifter(FS, size);
  shifter.setShift(pitch, formant);
  return input.map((x) => shifter.process(x));
}

describe('PitchShifter', () => {
  it.each([512, 1024, 2048])('+12 semitones doubles the strongest spectral line (frame %i)', (size) => {
    const out = shift(size, 12, 12, harmonics(150, 1.5));
    expect(Math.abs(dominantFrequency(out, 40000) - 300)).toBeLessThan(6);
  });

  it('+12 semitones doubles the fundamental of a formant-shaped vowel (clean mode)', () => {
    const out = shift(2048, 12, 12, vowel(150, 1.5));
    expect(Math.abs(fundamental(out, 40000) - 300)).toBeLessThan(6);
  });

  it('pitch and formant are independent: formant moves energy, not the fundamental', () => {
    const input = vowel(120, 1.5);
    const plain = shift(2048, 0, 0, input);
    const bright = shift(2048, 0, 6, input);
    expect(Math.abs(fundamental(bright, 40000) - fundamental(plain, 40000))).toBeLessThan(5);
    // more high-frequency energy once the formants move up
    const hf = (x: Float32Array): number => {
      let hi = 0,
        all = 0;
      for (let i = 1; i < x.length; i++) {
        const d = x[i]! - x[i - 1]!;
        hi += d * d;
        all += x[i]! * x[i]!;
      }
      return hi / all;
    };
    expect(hf(bright.subarray(30000))).toBeGreaterThan(hf(plain.subarray(30000)));
  });

  it('-12 semitones halves the fundamental', () => {
    const out = shift(2048, -12, -12, vowel(240, 1.5));
    expect(Math.abs(fundamental(out, 40000) - 120)).toBeLessThan(4);
  });

  it('reports its latency as the frame size', () => {
    expect(new PitchShifter(FS, 1024).latency).toBe(1024);
  });

  it('keeps the output level within a sensible range of the input', () => {
    const input = vowel(130, 1.5);
    const out = shift(2048, 5, 3, input);
    const ratio = rms(out, 30000) / rms(input, 30000);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1.5);
  });

  it('a 0 / 0 shift is level neutral', () => {
    const input = vowel(140, 1);
    const out = shift(1024, 0, 0, input);
    expect(Math.abs(rms(out, 30000) / rms(input, 30000) - 1)).toBeLessThan(0.15);
  });

  it('never produces NaN or Infinity, even for extreme shifts', () => {
    const out = shift(2048, 12, -12, vowel(100, 1));
    expect(out.every(Number.isFinite)).toBe(true);
  });
});
