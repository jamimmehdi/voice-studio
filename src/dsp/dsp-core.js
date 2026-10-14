/*
 * Voice Studio DSP core.
 * Plain script: runs in the renderer (curve drawing), inside the AudioWorklet
 * (concatenated with processor.js) and under Node (tests).
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const TWO_PI = 2 * Math.PI;

  const dbToLin = (db) => Math.pow(10, db / 20);
  const linToDb = (x) => 20 * Math.log10(x > 1e-9 ? x : 1e-9);
  const coef = (ms, fs) => (ms <= 0 ? 0 : Math.exp(-1 / (ms * 0.001 * fs)));

  /* ------------------------------------------------------------------ */
  /* Biquad (RBJ cookbook)                                              */
  /* ------------------------------------------------------------------ */
  function biquadCoeffs(type, fs, f0, q, gainDb) {
    f0 = Math.min(Math.max(f0, 10), fs * 0.49);
    q = Math.max(q, 0.05);
    const A = Math.pow(10, (gainDb || 0) / 40);
    const w0 = (TWO_PI * f0) / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'lowpass':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'peaking':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cw + s);
        b1 = 2 * A * ((A - 1) - (A + 1) * cw);
        b2 = A * ((A + 1) - (A - 1) * cw - s);
        a0 = (A + 1) + (A - 1) * cw + s;
        a1 = -2 * ((A - 1) + (A + 1) * cw);
        a2 = (A + 1) + (A - 1) * cw - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cw + s);
        b1 = -2 * A * ((A - 1) + (A + 1) * cw);
        b2 = A * ((A + 1) + (A - 1) * cw - s);
        a0 = (A + 1) - (A - 1) * cw + s;
        a1 = 2 * ((A - 1) - (A + 1) * cw);
        a2 = (A + 1) - (A - 1) * cw - s;
        break;
      }
      default:
        return [1, 0, 0, 0, 0];
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  function biquadMagnitudeDb(c, fs, f) {
    const w = (TWO_PI * f) / fs;
    const c1 = Math.cos(w), s1 = Math.sin(w);
    const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c[0] + c[1] * c1 + c[2] * c2;
    const ni = -(c[1] * s1 + c[2] * s2);
    const dr = 1 + c[3] * c1 + c[4] * c2;
    const di = -(c[3] * s1 + c[4] * s2);
    const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di + 1e-30));
    return 20 * Math.log10(mag + 1e-12);
  }

  class Biquad {
    constructor() {
      this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
      this.z1 = 0; this.z2 = 0;
    }
    set(c) {
      this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4];
    }
    reset() { this.z1 = 0; this.z2 = 0; }
    process(x) {
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      return y;
    }
  }

  /* ------------------------------------------------------------------ */
  /* FFT (radix-2, in place). inverse() is scaled by 1/N.               */
  /* ------------------------------------------------------------------ */
  class FFT {
    constructor(n) {
      this.n = n;
      this.levels = Math.round(Math.log2(n));
      this.cos = new Float64Array(n / 2);
      this.sin = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) {
        this.cos[i] = Math.cos((TWO_PI * i) / n);
        this.sin[i] = Math.sin((TWO_PI * i) / n);
      }
      this.rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        let r = 0;
        for (let b = 0; b < this.levels; b++) r |= ((i >>> b) & 1) << (this.levels - 1 - b);
        this.rev[i] = r;
      }
    }
    _transform(re, im, sign) {
      const n = this.n, rev = this.rev;
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const wr = this.cos[k], wi = sign * this.sin[k];
            const tr = re[l] * wr - im[l] * wi;
            const ti = re[l] * wi + im[l] * wr;
            re[l] = re[j] - tr; im[l] = im[j] - ti;
            re[j] += tr; im[j] += ti;
          }
        }
      }
    }
    forward(re, im) { this._transform(re, im, -1); }
    inverse(re, im) {
      this._transform(re, im, 1);
      const s = 1 / this.n;
      for (let i = 0; i < this.n; i++) { re[i] *= s; im[i] *= s; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phase-vocoder pitch shifter with cepstral formant control          */
  /* ------------------------------------------------------------------ */
  class PitchShifter {
    constructor(fs, n) {
      this.fs = fs;
      this.n = n;
      this.half = n / 2;
      this.osamp = 4;
      this.hop = n / this.osamp;
      this.fft = new FFT(n);
      this.win = new Float32Array(n);
      for (let i = 0; i < n; i++) this.win[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / n);
      this.hist = new Float32Array(n);
      this.acc = new Float32Array(n);
      this.inChunk = new Float32Array(this.hop);
      this.outChunk = new Float32Array(this.hop);
      this.inCount = 0;
      this.outRead = 0;
      const h = this.half + 1;
      this.re = new Float64Array(n);
      this.im = new Float64Array(n);
      this.mag = new Float64Array(h);
      this.freq = new Float64Array(h);
      this.lastPhase = new Float64Array(h);
      this.sumPhase = new Float64Array(h);
      this.env = new Float64Array(h + 1);
      this.synMag = new Float64Array(h);
      this.synFreq = new Float64Array(h);
      this.lifter = Math.max(8, Math.round(fs / 600));
      this.pitchRatio = 1;
      this.formantRatio = 1;
    }
    get latency() { return this.n; }

    setShift(pitchSemis, formantSemis) {
      this.pitchRatio = Math.pow(2, pitchSemis / 12);
      this.formantRatio = Math.pow(2, formantSemis / 12);
    }

    process(x) {
      this.inChunk[this.inCount++] = x;
      const y = this.outChunk[this.outRead++];
      if (this.inCount >= this.hop) {
        this._frame();
        this.inCount = 0;
        this.outRead = 0;
      }
      return y;
    }

    _frame() {
      const n = this.n, half = this.half, hop = this.hop, osamp = this.osamp;
      const re = this.re, im = this.im, win = this.win;
      const mag = this.mag, freq = this.freq, env = this.env;
      const expct = (TWO_PI * hop) / n;

      this.hist.copyWithin(0, hop);
      this.hist.set(this.inChunk, n - hop);
      for (let i = 0; i < n; i++) { re[i] = this.hist[i] * win[i]; im[i] = 0; }
      this.fft.forward(re, im);

      // analysis: magnitude + true frequency (in bins)
      for (let k = 0; k <= half; k++) {
        const r = re[k], i = im[k];
        mag[k] = Math.sqrt(r * r + i * i);
        const ph = Math.atan2(i, r);
        let d = ph - this.lastPhase[k] - k * expct;
        this.lastPhase[k] = ph;
        d -= TWO_PI * Math.round(d / TWO_PI);
        freq[k] = k + (d * osamp) / TWO_PI;
      }

      // spectral envelope through cepstral liftering
      for (let k = 0; k <= half; k++) {
        re[k] = Math.log(mag[k] + 1e-9);
        im[k] = 0;
      }
      for (let k = 1; k < half; k++) { re[n - k] = re[k]; im[n - k] = 0; }
      this.fft.inverse(re, im);
      const L = this.lifter, L2 = L * 1.5;
      for (let q = 0; q < n; q++) {
        const qq = q <= half ? q : n - q;
        let w;
        if (qq <= L) w = 1;
        else if (qq < L2) w = 0.5 * (1 + Math.cos((PI * (qq - L)) / (L2 - L)));
        else w = 0;
        re[q] *= w; im[q] = 0;
      }
      this.fft.forward(re, im);
      for (let k = 0; k <= half; k++) env[k] = Math.exp(re[k]);
      env[half + 1] = env[half];

      // pitch shift of the flattened spectrum
      const synMag = this.synMag, synFreq = this.synFreq;
      synMag.fill(0); synFreq.fill(0);
      const p = this.pitchRatio;
      for (let k = 0; k <= half; k++) {
        const idx = Math.round(k * p);
        if (idx > half) break;
        synMag[idx] += mag[k] / (env[k] + 1e-9);
        synFreq[idx] = freq[k] * p;
      }

      // re-apply (shifted) envelope and synthesise phases
      const invF = 1 / this.formantRatio;
      for (let k = 0; k <= half; k++) {
        let pos = k * invF;
        if (pos > half) pos = half;
        const i0 = pos | 0;
        const fr = pos - i0;
        const e = env[i0] * (1 - fr) + env[i0 + 1] * fr;
        const m = synMag[k] * e;
        const inc = (TWO_PI * (synFreq[k] - k)) / osamp + k * expct;
        this.sumPhase[k] += inc;
        if (this.sumPhase[k] > 1e6 || this.sumPhase[k] < -1e6) this.sumPhase[k] %= TWO_PI;
        re[k] = m * Math.cos(this.sumPhase[k]);
        im[k] = m * Math.sin(this.sumPhase[k]);
      }
      im[0] = 0; im[half] = 0;
      for (let k = 1; k < half; k++) { re[n - k] = re[k]; im[n - k] = -im[k]; }
      this.fft.inverse(re, im);

      const norm = 1 / 1.5; // sum of Hann^2 at 75% overlap
      for (let i = 0; i < n; i++) this.acc[i] += re[i] * win[i] * norm;
      this.outChunk.set(this.acc.subarray(0, hop));
      this.acc.copyWithin(0, hop);
      this.acc.fill(0, n - hop);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Downward expander / gate                                           */
  /* ------------------------------------------------------------------ */
  class Expander {
    constructor(fs) {
      this.fs = fs; this.env = 0; this.gDb = 0; this.hold = 0;
      this.dAtt = coef(0.5, fs); this.dRel = coef(12, fs);
      this.gr = 0;
      this.set({ thresh: -50, ratio: 2.5, attack: 2, release: 120, hold: 30, range: 30 });
    }
    set(p) {
      this.thr = p.thresh; this.ratio = p.ratio; this.range = p.range;
      this.aA = coef(p.attack, this.fs); this.aR = coef(p.release, this.fs);
      this.holdS = (p.hold * 0.001 * this.fs) | 0;
    }
    process(x) {
      const a = Math.abs(x);
      const c = a > this.env ? this.dAtt : this.dRel;
      this.env = a + c * (this.env - a);
      const lvl = linToDb(this.env);
      let target;
      if (lvl >= this.thr) { this.hold = this.holdS; target = 0; }
      else if (this.hold > 0) { this.hold--; target = 0; }
      else target = -Math.min(this.range, (this.thr - lvl) * (this.ratio - 1));
      const cc = target > this.gDb ? this.aA : this.aR;
      this.gDb = target + cc * (this.gDb - target);
      this.gr = this.gDb;
      return x * dbToLin(this.gDb);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Split-band de-esser                                                */
  /* ------------------------------------------------------------------ */
  class DeEsser {
    constructor(fs) {
      this.fs = fs; this.bp = new Biquad(); this.env = 0; this.gDb = 0; this.gr = 0;
      this.dAtt = coef(0.3, fs); this.dRel = coef(15, fs);
      this.aA = coef(0.5, fs); this.aR = coef(40, fs);
      this.set({ freq: 6500, q: 1.2, thresh: -32, ratio: 4, range: 12, mode: 0, listen: false });
    }
    set(p) {
      this.bp.set(biquadCoeffs('bandpass', this.fs, p.freq, p.q, 0));
      this.thr = p.thresh; this.ratio = p.ratio; this.range = p.range;
      this.wide = p.mode === 1; this.listen = !!p.listen;
    }
    process(x) {
      const band = this.bp.process(x);
      const a = Math.abs(band);
      const c = a > this.env ? this.dAtt : this.dRel;
      this.env = a + c * (this.env - a);
      const lvl = linToDb(this.env);
      const over = lvl - this.thr;
      const target = over > 0 ? -Math.min(this.range, over * (1 - 1 / this.ratio)) : 0;
      const cc = target < this.gDb ? this.aA : this.aR;
      this.gDb = target + cc * (this.gDb - target);
      this.gr = this.gDb;
      const g = dbToLin(this.gDb);
      if (this.listen) return band;
      return this.wide ? x * g : (x - band) + band * g;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Compressor (feed-forward, soft knee, parallel mix)                 */
  /* ------------------------------------------------------------------ */
  class Compressor {
    constructor(fs) {
      this.fs = fs; this.env = 0; this.gDb = 0; this.gr = 0;
      this.dRel = coef(5, fs);
      this.set({ thresh: -20, ratio: 3, attack: 8, release: 120, knee: 6, makeup: 4, mix: 100 });
    }
    set(p) {
      this.thr = p.thresh; this.ratio = p.ratio; this.knee = Math.max(p.knee, 0.01);
      this.aA = coef(p.attack, this.fs); this.aR = coef(p.release, this.fs);
      this.makeup = dbToLin(p.makeup); this.mix = p.mix / 100;
    }
    process(x) {
      const a = Math.abs(x);
      this.env = a > this.env ? a : a + this.dRel * (this.env - a);
      const inDb = linToDb(this.env);
      const over = inDb - this.thr;
      let outDb;
      if (2 * over < -this.knee) outDb = inDb;
      else if (2 * Math.abs(over) <= this.knee) {
        const t = over + this.knee / 2;
        outDb = inDb + ((1 / this.ratio - 1) * t * t) / (2 * this.knee);
      } else outDb = this.thr + over / this.ratio;
      const target = outDb - inDb;
      const c = target < this.gDb ? this.aA : this.aR;
      this.gDb = target + c * (this.gDb - target);
      this.gr = this.gDb;
      const g = dbToLin(this.gDb) * this.makeup;
      return x * (1 - this.mix) + x * g * this.mix;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Look-ahead brick-wall limiter                                      */
  /* ------------------------------------------------------------------ */
  class Limiter {
    constructor(fs) {
      this.fs = fs;
      this.L = Math.max(8, Math.round(0.002 * fs));
      this.W = this.L + 1;
      this.delay = new Float32Array(this.W);
      this.envHist = new Float32Array(this.W).fill(1);
      this.dqVal = new Float64Array(this.W + 1);
      this.dqIdx = new Float64Array(this.W + 1);
      this.dqHead = 0; this.dqLen = 0;
      this.pos = 0; this.n = 0; this.env = 1; this.sum = this.W; this.gr = 0;
      this.set({ ceiling: -1, release: 80 });
    }
    get latency() { return this.L; }
    set(p) {
      this.ceil = dbToLin(p.ceiling);
      this.rel = coef(p.release, this.fs);
    }
    process(x) {
      const W = this.W, cap = W + 1;
      const a = Math.abs(x);
      const gIn = a > this.ceil ? this.ceil / a : 1;
      // monotonic deque -> running minimum of the last W gain values
      const tail = (this.dqHead + this.dqLen) % cap;
      let len = this.dqLen;
      while (len > 0) {
        const last = (this.dqHead + len - 1) % cap;
        if (this.dqVal[last] >= gIn) len--; else break;
      }
      const t2 = (this.dqHead + len) % cap;
      this.dqVal[t2] = gIn; this.dqIdx[t2] = this.n;
      len++;
      while (len > 0 && this.dqIdx[this.dqHead] <= this.n - W) {
        this.dqHead = (this.dqHead + 1) % cap; len--;
      }
      this.dqLen = len;
      void tail;
      const target = this.dqVal[this.dqHead];
      this.n++;

      this.env = target < this.env ? target : target + this.rel * (this.env - target);
      // moving average of env over W samples
      this.sum += this.env - this.envHist[this.pos];
      this.envHist[this.pos] = this.env;
      const g = this.sum / W;

      const d = this.delay[this.pos];
      this.delay[this.pos] = x;
      this.pos = (this.pos + 1) % W;
      this.gr = linToDb(g);
      return d * g;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Whole signal chain                                                 */
  /* ------------------------------------------------------------------ */
  const DEFAULT_PARAMS = () => ({
    bypass: false,
    inGain: 0,
    outGain: 0,
    voice: { on: true, pitch: 0, formant: 0, mix: 100, quality: 2048,
             robot: false, robotFreq: 60, robotMix: 100 },
    hpf: { on: true, freq: 80, slope: 24 },
    exp: { on: true, thresh: -58, ratio: 2, attack: 3, release: 200, hold: 80, range: 18 },
    deess: { on: true, freq: 6500, q: 1.2, thresh: -32, ratio: 4, range: 12, mode: 0, listen: false },
    eq: { on: true, bands: [
      { type: 'lowshelf', freq: 120, gain: 0, q: 0.7, on: true },
      { type: 'peaking', freq: 300, gain: 0, q: 1.0, on: true },
      { type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
      { type: 'peaking', freq: 3000, gain: 0, q: 1.0, on: true },
      { type: 'peaking', freq: 6000, gain: 0, q: 1.0, on: true },
      { type: 'highshelf', freq: 10000, gain: 0, q: 0.7, on: true },
    ] },
    comp: { on: true, thresh: -20, ratio: 3, attack: 8, release: 120, knee: 6, makeup: 3, mix: 100 },
    lim: { on: true, ceiling: -1, release: 80 },
  });

  class VoiceChain {
    constructor(fs) {
      this.fs = fs;
      this.params = DEFAULT_PARAMS();
      this.hpf = [new Biquad(), new Biquad()];
      this.exp = new Expander(fs);
      this.shifter = null;
      this.shifterN = 0;
      this.dryDelay = null; this.dryPos = 0;
      this.deess = new DeEsser(fs);
      this.eq = [0, 1, 2, 3, 4, 5].map(() => new Biquad());
      this.comp = new Compressor(fs);
      this.lim = new Limiter(fs);
      this.inGainLin = 1; this.outGainLin = 1;
      this.inGainCur = 1; this.outGainCur = 1;
      this.wetCur = 0; this.bypassCur = 0;
      this.robotPhase = 0;
      this.smooth = coef(10, fs);
      this.meters = { inPeak: 0, outPeak: 0, exp: 0, deess: 0, comp: 0, lim: 0 };
      this.setParams(this.params);
    }

    get latencySamples() {
      const v = this.params.voice;
      let l = 0;
      if (v.on) l += this.shifterN;
      if (this.params.lim.on) l += this.lim.latency;
      return l;
    }

    setParams(p) {
      this.params = p;
      const fs = this.fs;
      this.inGainLin = dbToLin(p.inGain);
      this.outGainLin = dbToLin(p.outGain);
      // high-pass: 12 dB/oct or 24 dB/oct (Butterworth)
      if (p.hpf.slope === 24) {
        this.hpf[0].set(biquadCoeffs('highpass', fs, p.hpf.freq, 0.5412, 0));
        this.hpf[1].set(biquadCoeffs('highpass', fs, p.hpf.freq, 1.3066, 0));
      } else {
        this.hpf[0].set(biquadCoeffs('highpass', fs, p.hpf.freq, 0.7071, 0));
        this.hpf[1].set([1, 0, 0, 0, 0]);
      }
      this.exp.set(p.exp);
      this.deess.set(p.deess);
      p.eq.bands.forEach((b, i) => {
        this.eq[i].set(b.on ? biquadCoeffs(b.type, fs, b.freq, b.q, b.gain) : [1, 0, 0, 0, 0]);
      });
      this.comp.set(p.comp);
      this.lim.set(p.lim);
      const n = p.voice.quality | 0;
      if (n !== this.shifterN) {
        this.shifterN = n;
        this.shifter = new PitchShifter(fs, n);
        this.dryDelay = new Float32Array(n);
        this.dryPos = 0;
      }
      this.shifter.setShift(p.voice.pitch, p.voice.formant);
      this.robotInc = (p.voice.robotFreq * 1) / fs;
    }

    /** Process n mono samples. */
    process(inp, out, n) {
      const p = this.params;
      const sm = this.smooth;
      const v = p.voice;
      const m = this.meters;
      let inPk = 0, outPk = 0, grExp = 0, grDe = 0, grComp = 0, grLim = 0;
      const delayLen = this.shifterN;
      const wetTarget = v.on ? v.mix / 100 : 0;
      const byTarget = p.bypass ? 1 : 0;
      const shiftActive = v.on || this.wetCur > 0.001;

      for (let i = 0; i < n; i++) {
        this.inGainCur = this.inGainLin + sm * (this.inGainCur - this.inGainLin);
        this.outGainCur = this.outGainLin + sm * (this.outGainCur - this.outGainLin);
        this.wetCur = wetTarget + sm * (this.wetCur - wetTarget);
        this.bypassCur = byTarget + sm * (this.bypassCur - byTarget);

        const raw = inp[i];
        let x = raw * this.inGainCur;
        const ax = Math.abs(raw);
        if (ax > inPk) inPk = ax;

        if (p.hpf.on) x = this.hpf[1].process(this.hpf[0].process(x));
        if (p.exp.on) { x = this.exp.process(x); if (this.exp.gr < grExp) grExp = this.exp.gr; }

        // voice changer (dry path is delayed to stay phase aligned)
        if (shiftActive) {
          const wet = this.shifter.process(x);
          const dry = this.dryDelay[this.dryPos];
          this.dryDelay[this.dryPos] = x;
          this.dryPos = (this.dryPos + 1) % delayLen;
          let w = wet;
          if (v.robot) {
            this.robotPhase += this.robotInc;
            if (this.robotPhase >= 1) this.robotPhase -= 1;
            const rm = Math.sin(TWO_PI * this.robotPhase);
            const rmix = v.robotMix / 100;
            w = wet * (1 - rmix) + wet * rm * rmix;
          }
          x = dry * (1 - this.wetCur) + w * this.wetCur;
        }

        if (p.deess.on) { x = this.deess.process(x); if (this.deess.gr < grDe) grDe = this.deess.gr; }
        if (p.eq.on) {
          for (let b = 0; b < 6; b++) x = this.eq[b].process(x);
        }
        if (p.comp.on) { x = this.comp.process(x); if (this.comp.gr < grComp) grComp = this.comp.gr; }
        x *= this.outGainCur;
        if (p.lim.on) { x = this.lim.process(x); if (this.lim.gr < grLim) grLim = this.lim.gr; }
        if (x > 1) x = 1; else if (x < -1) x = -1;

        // bypass keeps the raw mic signal (gain-matched by input gain only)
        const y = x * (1 - this.bypassCur) + raw * this.bypassCur;
        const ay = Math.abs(y);
        if (ay > outPk) outPk = ay;
        out[i] = y;
      }
      m.inPeak = Math.max(m.inPeak, inPk);
      m.outPeak = Math.max(m.outPeak, outPk);
      m.exp = Math.min(m.exp, grExp);
      m.deess = Math.min(m.deess, grDe);
      m.comp = Math.min(m.comp, grComp);
      m.lim = Math.min(m.lim, grLim);
    }

    takeMeters() {
      const m = this.meters;
      const snap = { inPeak: m.inPeak, outPeak: m.outPeak, exp: m.exp, deess: m.deess, comp: m.comp, lim: m.lim };
      m.inPeak = 0; m.outPeak = 0; m.exp = 0; m.deess = 0; m.comp = 0; m.lim = 0;
      return snap;
    }
  }

  const api = {
    dbToLin, linToDb, coef, biquadCoeffs, biquadMagnitudeDb,
    Biquad, FFT, PitchShifter, Expander, DeEsser, Compressor, Limiter,
    VoiceChain, DEFAULT_PARAMS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceDSP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
