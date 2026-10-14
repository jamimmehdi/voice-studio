import { createDefaultParams, type StudioParams } from '@shared/params';
import type { MeterSnapshot } from '@shared/protocols';
import { Biquad, biquadCoeffs, IDENTITY_COEFFS } from './biquad';
import { Compressor } from './compressor';
import { DeEsser } from './deesser';
import { Expander } from './expander';
import { Limiter } from './limiter';
import { smoothingCoef, dbToLin } from './math';
import { PitchShifter } from './pitch-shifter';
import { RingModulator } from './ring-modulator';

/**
 * The whole studio signal chain for one mono channel:
 *
 *   input gain -> high-pass -> gate -> voice changer -> de-esser -> EQ -> compressor -> output gain -> limiter
 *
 * It is plain, allocation-free-per-sample DSP with no browser dependencies, so it runs inside the
 * AudioWorklet and under Node (unit tests) alike.
 */
export class VoiceChain {
  private params: StudioParams = createDefaultParams();

  private readonly hpf: [Biquad, Biquad] = [new Biquad(), new Biquad()];
  private readonly expander: Expander;
  private shifter: PitchShifter | null = null;
  private shifterSize = 0;
  private dryDelay = new Float32Array(1);
  private dryPos = 0;
  private readonly robot: RingModulator;
  private readonly deesser: DeEsser;
  private readonly eq: Biquad[] = Array.from({ length: 6 }, () => new Biquad());
  private readonly compressor: Compressor;
  private readonly limiter: Limiter;

  private inGainTarget = 1;
  private outGainTarget = 1;
  private inGainCur = 1;
  private outGainCur = 1;
  private wetCur = 0;
  private bypassCur = 0;
  private readonly smooth: number;

  private meters: MeterSnapshot = { inPeak: 0, outPeak: 0, exp: 0, deess: 0, comp: 0, lim: 0 };

  constructor(readonly sampleRate: number) {
    this.smooth = smoothingCoef(10, sampleRate);
    this.expander = new Expander(sampleRate);
    this.robot = new RingModulator(sampleRate);
    this.deesser = new DeEsser(sampleRate);
    this.compressor = new Compressor(sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.setParams(this.params);
  }

  /** Total processing delay with the current settings, in samples. */
  get latencySamples(): number {
    let latency = 0;
    if (this.params.voice.on) latency += this.shifterSize;
    if (this.params.lim.on) latency += this.limiter.latency;
    return latency;
  }

  setParams(p: StudioParams): void {
    this.params = p;
    const fs = this.sampleRate;

    this.inGainTarget = dbToLin(p.inGain);
    this.outGainTarget = dbToLin(p.outGain);

    // high-pass: 12 dB/oct or 24 dB/oct (Butterworth sections)
    if (p.hpf.slope === 24) {
      this.hpf[0].set(biquadCoeffs('highpass', fs, p.hpf.freq, 0.5412));
      this.hpf[1].set(biquadCoeffs('highpass', fs, p.hpf.freq, 1.3066));
    } else {
      this.hpf[0].set(biquadCoeffs('highpass', fs, p.hpf.freq, 0.7071));
      this.hpf[1].set(IDENTITY_COEFFS);
    }

    this.expander.set(p.exp);
    this.deesser.set(p.deess);
    p.eq.bands.forEach((b, i) => {
      this.eq[i]!.set(b.on ? biquadCoeffs(b.type, fs, b.freq, b.q, b.gain) : IDENTITY_COEFFS);
    });
    this.compressor.set(p.comp);
    this.limiter.set(p.lim);

    if (p.voice.quality !== this.shifterSize) {
      this.shifterSize = p.voice.quality;
      this.shifter = new PitchShifter(fs, p.voice.quality);
      this.dryDelay = new Float32Array(p.voice.quality);
      this.dryPos = 0;
    }
    this.shifter!.setShift(p.voice.pitch, p.voice.formant);
    this.robot.set(p.voice.robotFreq, p.voice.robotMix);
  }

  /** Processes `n` mono samples from `input` into `output`. */
  process(input: Float32Array, output: Float32Array, n: number): void {
    const p = this.params;
    const v = p.voice;
    const sm = this.smooth;
    const m = this.meters;
    const delayLen = this.shifterSize;
    const wetTarget = v.on ? v.mix / 100 : 0;
    const bypassTarget = p.bypass ? 1 : 0;
    const shiftActive = v.on || this.wetCur > 0.001;

    let inPeak = 0;
    let outPeak = 0;
    let grExp = 0;
    let grDe = 0;
    let grComp = 0;
    let grLim = 0;

    for (let i = 0; i < n; i++) {
      this.inGainCur = this.inGainTarget + sm * (this.inGainCur - this.inGainTarget);
      this.outGainCur = this.outGainTarget + sm * (this.outGainCur - this.outGainTarget);
      this.wetCur = wetTarget + sm * (this.wetCur - wetTarget);
      this.bypassCur = bypassTarget + sm * (this.bypassCur - bypassTarget);

      const raw = input[i]!;
      let x = raw * this.inGainCur;
      const rawAbs = Math.abs(raw);
      if (rawAbs > inPeak) inPeak = rawAbs;

      if (p.hpf.on) x = this.hpf[1].process(this.hpf[0].process(x));

      if (p.exp.on) {
        x = this.expander.process(x);
        if (this.expander.gainReductionDb < grExp) grExp = this.expander.gainReductionDb;
      }

      // voice changer; the dry path is delayed by the shifter latency so the crossfade stays phase aligned
      if (shiftActive) {
        const wetSample = this.shifter!.process(x);
        const dry = this.dryDelay[this.dryPos]!;
        this.dryDelay[this.dryPos] = x;
        this.dryPos = (this.dryPos + 1) % delayLen;
        const wet = v.robot ? this.robot.process(wetSample) : wetSample;
        x = dry * (1 - this.wetCur) + wet * this.wetCur;
      }

      if (p.deess.on) {
        x = this.deesser.process(x);
        if (this.deesser.gainReductionDb < grDe) grDe = this.deesser.gainReductionDb;
      }

      if (p.eq.on) for (let b = 0; b < 6; b++) x = this.eq[b]!.process(x);

      if (p.comp.on) {
        x = this.compressor.process(x);
        if (this.compressor.gainReductionDb < grComp) grComp = this.compressor.gainReductionDb;
      }

      x *= this.outGainCur;

      if (p.lim.on) {
        x = this.limiter.process(x);
        if (this.limiter.gainReductionDb < grLim) grLim = this.limiter.gainReductionDb;
      }
      if (x > 1) x = 1;
      else if (x < -1) x = -1;

      // bypass crossfades to the raw microphone signal
      const y = x * (1 - this.bypassCur) + raw * this.bypassCur;
      const ay = Math.abs(y);
      if (ay > outPeak) outPeak = ay;
      output[i] = y;
    }

    m.inPeak = Math.max(m.inPeak, inPeak);
    m.outPeak = Math.max(m.outPeak, outPeak);
    m.exp = Math.min(m.exp, grExp);
    m.deess = Math.min(m.deess, grDe);
    m.comp = Math.min(m.comp, grComp);
    m.lim = Math.min(m.lim, grLim);
  }

  /** Returns the peak / gain-reduction values gathered since the last call and resets them. */
  takeMeters(): MeterSnapshot {
    const snapshot = { ...this.meters };
    this.meters = { inPeak: 0, outPeak: 0, exp: 0, deess: 0, comp: 0, lim: 0 };
    return snapshot;
  }
}
