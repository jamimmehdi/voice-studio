// Measures CPU cost and "choppiness" of the voice chain on a synthetic voiced signal.
const D = require(process.env.DSP || '../src/dsp/dsp-core.js');
const fs = 48000;

// vowel-like signal: f0 with slight vibrato, harmonics shaped by 3 formants, with pauses
function speech(secs, f0 = 115) {
  const n = Math.round(secs * fs);
  const s = new Float32Array(n);
  const forms = [[700, 90], [1200, 110], [2600, 160]];
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const vib = 1 + 0.015 * Math.sin(2 * Math.PI * 5 * t) + 0.04 * Math.sin(2 * Math.PI * 0.7 * t);
    ph += (2 * Math.PI * f0 * vib) / fs;
    let v = 0;
    for (let h = 1; h * f0 < 6000; h++) {
      const f = h * f0 * vib;
      let g = 0;
      for (const [fc, bw] of forms) g += 1 / (1 + Math.pow((f - fc) / bw, 2));
      v += (g / h) * Math.sin(h * ph);
    }
    // syllable envelope: 0.5 s on / 0.2 s off
    const cyc = t % 0.7;
    const env = cyc < 0.5 ? Math.min(1, cyc / 0.03) * Math.min(1, (0.5 - cyc) / 0.05) : 0;
    s[i] = 0.25 * v * env + (Math.random() - 0.5) * 0.002;
  }
  return s;
}

function runBlocks(chain, sig) {
  const out = new Float32Array(sig.length);
  let worst = 0, total = 0, blocks = 0;
  for (let i = 0; i + 128 <= sig.length; i += 128) {
    const t0 = process.hrtime.bigint();
    chain.process(sig.subarray(i, i + 128), out.subarray(i, i + 128), 128);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    total += dt; blocks++; if (dt > worst) worst = dt;
  }
  return { out, avgMs: total / blocks, worstMs: worst, budgetMs: (128 / fs) * 1000 };
}

function envCV(x, from, to) { // coefficient of variation of 4 ms RMS envelope inside voiced region
  const w = Math.round(0.004 * fs), vals = [];
  for (let i = from; i + w < to; i += w) {
    let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j];
    vals.push(Math.sqrt(s / w));
  }
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length;
  return Math.sqrt(v) / m;
}

module.exports = { speech, runBlocks, envCV, fs };

if (require.main === module) {
  const sig = speech(6);
  const cfgs = [
    ['512 ', 512], ['1024', 1024], ['2048', 2048],
  ];
  // steady vowel for envelope stability
  const steady = new Float32Array(fs * 2);
  { const f0 = 115; for (let i = 0; i < steady.length; i++) {
      let v = 0; for (let h = 1; h * f0 < 5000; h++) v += (1 / h) * Math.sin(2 * Math.PI * h * f0 * i / fs);
      steady[i] = 0.15 * v; } }
  console.log('quality   avg ms/block  worst ms  budget ms   steady-vowel envelope CV (lower = smoother)');
  for (const [name, q] of cfgs) {
    const p = D.DEFAULT_PARAMS();
    p.voice.pitch = 4.5; p.voice.formant = 2.8; p.voice.quality = q;
    const c = new D.VoiceChain(fs); c.setParams(p);
    const r = runBlocks(c, sig);
    const c2 = new D.VoiceChain(fs); c2.setParams(p);
    const r2 = runBlocks(c2, steady);
    console.log(`${name}      ${r.avgMs.toFixed(3)}        ${r.worstMs.toFixed(2)}      ${r.budgetMs.toFixed(2)}        ${envCV(r2.out, 48000, 90000).toFixed(3)}`);
  }
  const ref = envCV(steady, 48000, 90000);
  console.log('reference (unprocessed) CV:', ref.toFixed(3));
}
