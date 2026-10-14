import { FFT } from '@engine/dsp/fft';
import { VoiceChain } from '@engine/dsp/voice-chain';
import { createDefaultParams, type StudioParams } from '@shared/params';

export const FS = 48000;

export function sine(freq: number, seconds: number, amp = 0.5, fs = FS): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return out;
}

/** Harmonic "vowel": f0 plus harmonics shaped by three formant peaks. */
export function vowel(f0: number, seconds: number, amp = 0.12, fs = FS): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  const formants: Array<[number, number]> = [[700, 90], [1200, 110], [2600, 160]];
  for (let h = 1; h * f0 < 6000; h++) {
    let g = 0;
    for (const [fc, bw] of formants) g += 1 / (1 + Math.pow((h * f0 - fc) / bw, 2));
    for (let i = 0; i < n; i++) out[i]! += amp * (g / h) * Math.sin((2 * Math.PI * h * f0 * i) / fs);
  }
  return out;
}

/** Plain harmonic series with 1/h amplitudes: the strongest spectral line is the fundamental. */
export function harmonics(f0: number, seconds: number, amp = 0.1, fs = FS): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  for (let h = 1; h * f0 < 5000; h++) {
    for (let i = 0; i < n; i++) out[i]! += (amp / h) * Math.sin((2 * Math.PI * h * f0 * i) / fs);
  }
  return out;
}

export function noise(seconds: number, amp: number, fs = FS): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  let seed = 12345; // deterministic
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * amp;
  }
  return out;
}

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

export function peak(x: Float32Array, from = 0, to = x.length): number {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

export const toDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-9));

/** Frequency (Hz) of the strongest spectral peak in a Hann-windowed segment. */
export function dominantFrequency(x: Float32Array, from: number, length = 16384, fs = FS): number {
  const N = 16384;
  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const len = Math.min(length, N);
  for (let i = 0; i < len; i++) re[i] = x[from + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  fft.forward(re, im);
  let best = 0;
  let bin = 0;
  for (let k = 5; k < N / 2; k++) {
    const m = Math.hypot(re[k]!, im[k]!);
    if (m > best) {
      best = m;
      bin = k;
    }
  }
  return (bin * fs) / N;
}

/**
 * Fundamental frequency (Hz) by normalised autocorrelation between 70 and 600 Hz.
 * Unlike an FFT peak it is not fooled by a strong formant harmonic.
 */
export function fundamental(x: Float32Array, from: number, length = 9600, fs = FS): number {
  const minLag = Math.floor(fs / 600);
  const maxLag = Math.ceil(fs / 70);
  const corr = new Float64Array(maxLag + 1);
  let energy = 0;
  for (let i = 0; i < length; i++) energy += x[from + i]! * x[from + i]!;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < length; i++) s += x[from + i]! * x[from + i + lag]!;
    corr[lag] = s / (energy || 1);
    if (corr[lag]! > best) best = corr[lag]!;
  }
  // first lag that is (nearly) as good as the best one avoids octave-down errors
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag]! >= 0.9 * best && corr[lag]! >= corr[lag - 1]! && corr[lag]! >= corr[lag + 1]!) return fs / lag;
  }
  return 0;
}

/** Runs a chain over a signal in 128-sample render quanta, like the AudioWorklet does. */
export function runChain(chain: VoiceChain, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    const n = Math.min(128, input.length - i);
    chain.process(input.subarray(i, i + n), out.subarray(i, i + n), n);
  }
  return out;
}

/** Params with every processing module switched off (the chain should then be transparent). */
export function flatParams(patch: (p: StudioParams) => void = () => undefined): StudioParams {
  const p = createDefaultParams();
  p.voice.on = false;
  p.hpf.on = false;
  p.exp.on = false;
  p.deess.on = false;
  p.eq.on = false;
  p.comp.on = false;
  p.lim.on = false;
  patch(p);
  return p;
}

export function chainWith(params: StudioParams, fs = FS): VoiceChain {
  const chain = new VoiceChain(fs);
  chain.setParams(params);
  return chain;
}
