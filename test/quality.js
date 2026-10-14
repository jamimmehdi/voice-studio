// Objective quality metrics for the pitch shifter on a steady synthetic vowel.
//   HNR  : energy at the expected harmonics vs energy between them (higher = cleaner / less "robotic")
//   AM   : amplitude modulation depth over 25 ms windows (higher = choppier / warbling)
const D = require(process.env.DSP || '../src/dsp/dsp-core.js');
const { runBlocks } = require('./profile.js');
const fs = 48000;

function vowel(f0, secs) {
  const n = Math.round(secs * fs), s = new Float32Array(n);
  const forms = [[700, 90], [1200, 110], [2600, 160]];
  for (let h = 1; h * f0 < 6000; h++) {
    let g = 0; for (const [fc, bw] of forms) g += 1 / (1 + Math.pow((h * f0 - fc) / bw, 2));
    for (let i = 0; i < n; i++) s[i] += 0.12 * (g / h) * Math.sin(2 * Math.PI * h * f0 * i / fs);
  }
  return s;
}

function spectrum(x, from, N = 32768) {
  const fft = new D.FFT(N), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[from + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft.forward(re, im);
  const p = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}

function hnr(x, f0out, from) {
  const N = 32768, p = spectrum(x, from, N), bin = fs / N;
  let harm = 0, between = 0;
  const maxF = 4000;
  for (let k = Math.round(150 / bin); k < maxF / bin; k++) {
    const f = k * bin;
    const h = f / f0out;
    const dist = Math.abs(h - Math.round(h)) * f0out; // Hz from nearest harmonic
    if (dist < 0.18 * f0out) harm += p[k]; else between += p[k];
  }
  return 10 * Math.log10(harm / Math.max(between, 1e-20));
}

function amDepth(x, from, to) {
  const w = Math.round(0.025 * fs), v = [];
  for (let i = from; i + w < to; i += w / 2) { let s = 0; for (let j = 0; j < w; j++) s += x[i + j] ** 2; v.push(Math.sqrt(s / w)); }
  const m = v.reduce((a, b) => a + b) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / m;
}

function evaluate(label, pitch, formant, quality, f0 = 115) {
  const p = D.DEFAULT_PARAMS();
  for (const k of ['hpf', 'exp', 'deess', 'eq', 'comp', 'lim']) p[k].on = false;
  p.voice.pitch = pitch; p.voice.formant = formant; p.voice.quality = quality;
  const c = new D.VoiceChain(fs); c.setParams(p);
  const x = vowel(f0, 4);
  const { out } = runBlocks(c, x);
  const f0out = f0 * Math.pow(2, pitch / 12);
  const h = hnr(out, f0out, fs * 2);
  const am = amDepth(out, fs * 1.5, fs * 3.5);
  console.log(`${label.padEnd(30)} q=${String(quality).padEnd(5)} HNR ${h.toFixed(1).padStart(6)} dB   AM ${am.toFixed(3)}`);
  return { h, am };
}

module.exports = { evaluate, vowel, hnr, amDepth };

if (require.main === module) {
  const ref = vowel(115, 4);
  console.log(`${'input (reference)'.padEnd(30)}         HNR ${hnr(ref, 115, fs * 2).toFixed(1).padStart(6)} dB   AM ${amDepth(ref, fs * 1.5, fs * 3.5).toFixed(3)}`);
  for (const q of [512, 1024, 2048]) evaluate('+4.5 st, formant +2.8', 4.5, 2.8, q);
  for (const q of [1024, 2048]) evaluate('+7 st, formant +4', 7, 4, q);
  for (const q of [1024, 2048]) evaluate('-5 st, formant -3', -5, -3, q);
}
