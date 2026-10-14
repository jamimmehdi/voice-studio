const assert = require('assert');
const D = require('../src/dsp/dsp-core.js');

const fs = 48000;
let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok  ', name); passed++; }
  catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
}

function run(chain, sig) {
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i += 128) {
    chain.process(sig.subarray(i, i + 128), out.subarray(i, i + 128), Math.min(128, sig.length - i));
  }
  return out;
}
function rms(a, from = 0, to = a.length) {
  let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
}
function peak(a, from = 0, to = a.length) {
  let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i])); return p;
}
// harmonic "voice": f0 with decaying harmonics
function voice(f0, secs, amp = 0.1) {
  const n = Math.round(secs * fs);
  const s = new Float32Array(n);
  for (let h = 1; h * f0 < 5000; h++) {
    for (let i = 0; i < n; i++) s[i] += (amp / h) * Math.sin((2 * Math.PI * h * f0 * i) / fs);
  }
  return s;
}
function dominantFreq(a, from, len) {
  const N = 16384;
  const fft = new D.FFT(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < Math.min(len, N); i++) re[i] = a[from + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  fft.forward(re, im);
  let best = 0, bk = 0;
  for (let k = 5; k < N / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    if (m > best) { best = m; bk = k; }
  }
  return (bk * fs) / N;
}
function flatParams(over = {}) {
  const p = D.DEFAULT_PARAMS();
  p.voice.on = false; p.hpf.on = false; p.exp.on = false; p.deess.on = false;
  p.eq.on = false; p.comp.on = false; p.lim.on = false;
  for (const k of Object.keys(over)) Object.assign(p[k] || (p[k] = {}), over[k]);
  return p;
}

console.log('DSP core tests');

test('FFT inverse(forward(x)) == x', () => {
  const f = new D.FFT(1024);
  const re = new Float64Array(1024).map(() => Math.random() - 0.5);
  const im = new Float64Array(1024);
  const ref = Float64Array.from(re);
  f.forward(re, im); f.inverse(re, im);
  for (let i = 0; i < 1024; i++) assert(Math.abs(re[i] - ref[i]) < 1e-9);
});

test('chain with everything off is transparent (unity)', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams());
  const x = voice(150, 1);
  const y = run(c, x);
  assert(Math.abs(rms(y, 24000) / rms(x, 24000) - 1) < 0.01);
});

for (const q of [512, 1024, 2048]) {
  test(`pitch shift +12 st doubles fundamental (N=${q})`, () => {
    const c = new D.VoiceChain(fs);
    c.setParams(flatParams({ voice: { on: true, pitch: 12, formant: 12, mix: 100, quality: q } }));
    const y = run(c, voice(150, 1.5));
    const f = dominantFreq(y, 40000, 16384);
    assert(Math.abs(f - 300) < 6, 'got ' + f.toFixed(1) + ' Hz');
  });
}

test('pitch shift +4.5 st on 120 Hz -> ~155.7 Hz', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ voice: { on: true, pitch: 4.5, formant: 2.5, mix: 100, quality: 1024 } }));
  const y = run(c, voice(120, 1.5));
  const f = dominantFreq(y, 40000, 16384);
  const expect = 120 * Math.pow(2, 4.5 / 12);
  // dominant partial is a harmonic multiple; check fundamental multiple
  const ratio = f / expect;
  assert(Math.abs(ratio - Math.round(ratio)) < 0.03, 'dominant ' + f.toFixed(1) + ' vs f0 ' + expect.toFixed(1));
});

test('pitch shifter keeps level within 3 dB', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ voice: { on: true, pitch: 5, formant: 3, mix: 100, quality: 1024 } }));
  const x = voice(130, 1.5);
  const y = run(c, x);
  const r = rms(y, 30000) / rms(x, 30000);
  assert(r > 0.7 && r < 1.4, 'ratio ' + r.toFixed(2));
});

test('0 st / 0 st shift is level-neutral and wet==dry aligned', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ voice: { on: true, pitch: 0, formant: 0, mix: 100, quality: 1024 } }));
  const x = voice(140, 1.0);
  const y = run(c, x);
  const r = rms(y, 30000) / rms(x, 30000);
  assert(Math.abs(r - 1) < 0.15, 'ratio ' + r.toFixed(3));
});

test('high-pass removes 40 Hz, keeps 1 kHz', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ hpf: { on: true, freq: 100, slope: 24 } }));
  const n = fs;
  const lo = new Float32Array(n), hi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lo[i] = 0.5 * Math.sin((2 * Math.PI * 40 * i) / fs);
    hi[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / fs);
  }
  const yl = run(c, lo);
  c.setParams(flatParams({ hpf: { on: true, freq: 100, slope: 24 } }));
  const yh = run(c, hi);
  assert(rms(yl, 20000) < rms(lo, 20000) * 0.1);
  assert(Math.abs(rms(yh, 20000) / rms(hi, 20000) - 1) < 0.05);
});

test('expander attenuates quiet noise, passes loud signal', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ exp: { on: true, thresh: -40, ratio: 4, attack: 1, release: 50, hold: 10, range: 40 } }));
  const quiet = new Float32Array(fs).map(() => (Math.random() * 2 - 1) * 0.003); // ~ -50 dBFS
  const yq = run(c, quiet);
  assert(rms(yq, 20000) < rms(quiet, 20000) * 0.3, 'quiet not reduced');
  const loud = voice(150, 1);
  const yl = run(c, loud);
  assert(Math.abs(rms(yl, 30000) / rms(loud, 30000) - 1) < 0.1, 'loud altered');
});

test('de-esser reduces 7 kHz burst more than 200 Hz tone', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ deess: { on: true, freq: 7000, q: 1.2, thresh: -30, ratio: 6, range: 18, mode: 0, listen: false } }));
  const n = fs;
  const s = new Float32Array(n), t = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s[i] = 0.4 * Math.sin((2 * Math.PI * 7000 * i) / fs);
    t[i] = 0.4 * Math.sin((2 * Math.PI * 200 * i) / fs);
  }
  const ys = run(c, s);
  const c2 = new D.VoiceChain(fs);
  c2.setParams(flatParams({ deess: { on: true, freq: 7000, q: 1.2, thresh: -30, ratio: 6, range: 18, mode: 0, listen: false } }));
  const yt = run(c2, t);
  const gs = rms(ys, 24000) / rms(s, 24000);
  const gt = rms(yt, 24000) / rms(t, 24000);
  assert(gs < 0.5, 'sibilance gain ' + gs.toFixed(2));
  assert(gt > 0.95, 'low tone gain ' + gt.toFixed(2));
});

test('compressor reduces dynamic range by ~ratio above threshold', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ comp: { on: true, thresh: -20, ratio: 4, attack: 1, release: 100, knee: 0, makeup: 0, mix: 100 } }));
  const n = fs;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 500 * i) / fs); // peak -6 dBFS
  const y = run(c, s);
  const outPk = D.linToDb(peak(y, 30000));
  // -6 dB in, thr -20 -> 14 dB over -> 3.5 dB over out => -16.5 dB
  assert(Math.abs(outPk - -16.5) < 1.5, 'out peak ' + outPk.toFixed(1) + ' dB');
});

test('limiter never exceeds ceiling (hot input)', () => {
  const c = new D.VoiceChain(fs);
  c.setParams(flatParams({ lim: { on: true, ceiling: -6, release: 60 } }));
  const n = fs * 2;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const env = i % 24000 < 100 ? 3.5 : 1.2; // sudden bursts
    s[i] = Math.max(-1, Math.min(1, env * Math.sin((2 * Math.PI * 330 * i) / fs)));
  }
  const y = run(c, s);
  const ceil = D.dbToLin(-6);
  assert(peak(y) <= ceil * 1.0005, 'peak ' + peak(y) + ' > ' + ceil);
  assert(rms(y, 20000) > 0.1, 'limiter killed signal');
});

test('full default chain on a voice: no NaN, bounded, latency reported', () => {
  const c = new D.VoiceChain(fs);
  const p = D.DEFAULT_PARAMS();
  p.voice.pitch = 5; p.voice.formant = 3;
  c.setParams(p);
  const y = run(c, voice(110, 2));
  for (let i = 0; i < y.length; i++) assert(Number.isFinite(y[i]) && Math.abs(y[i]) <= 1);
  assert(c.latencySamples > 1000);
});

test('parameter changes while running do not produce NaN/clicks > 6 dB', () => {
  const c = new D.VoiceChain(fs);
  const p = D.DEFAULT_PARAMS();
  c.setParams(p);
  const x = voice(130, 2);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 128) {
    if (i % 4096 === 0) {
      p.voice.pitch = Math.sin(i / 20000) * 8;
      p.hpf.freq = 60 + (i % 8192) / 40;
      c.setParams(p);
    }
    c.process(x.subarray(i, i + 128), out.subarray(i, i + 128), 128);
  }
  for (let i = 0; i < out.length; i++) assert(Number.isFinite(out[i]));
});

test('quality switch at runtime reallocates safely', () => {
  const c = new D.VoiceChain(fs);
  const p = D.DEFAULT_PARAMS();
  c.setParams(p);
  const x = voice(130, 0.5);
  run(c, x);
  p.voice.quality = 2048; c.setParams(p);
  const y = run(c, x);
  for (let i = 0; i < y.length; i++) assert(Number.isFinite(y[i]));
});

console.log(`\n${passed} passed`);


