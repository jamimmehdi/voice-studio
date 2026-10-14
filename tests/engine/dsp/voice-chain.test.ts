import { eqCurveDb } from '@engine/dsp/eq-curve';
import { VoiceChain } from '@engine/dsp/voice-chain';
import { createDefaultParams } from '@shared/params';
import { chainWith, flatParams, fundamental, FS, noise, peak, rms, runChain, sine, toDb, vowel } from '../../helpers/signals';

describe('VoiceChain', () => {
  it('is transparent when every module is off', () => {
    const input = vowel(150, 1);
    const out = runChain(chainWith(flatParams()), input);
    expect(Math.abs(rms(out, 24000) / rms(input, 24000) - 1)).toBeLessThan(0.01);
  });

  it('high-pass removes 40 Hz and keeps 1 kHz', () => {
    const p = flatParams((x) => { x.hpf = { on: true, freq: 100, slope: 24 }; });
    const low = runChain(chainWith(p), sine(40, 1, 0.5));
    const high = runChain(chainWith(p), sine(1000, 1, 0.5));
    expect(rms(low, 20000)).toBeLessThan(0.5 * 0.7071 * 0.1);
    expect(Math.abs(rms(high, 20000) / (0.5 * 0.7071) - 1)).toBeLessThan(0.05);
  });

  it('the 12 dB slope is gentler than the 24 dB slope', () => {
    const run = (slope: 12 | 24): number => {
      const p = flatParams((x) => { x.hpf = { on: true, freq: 200, slope }; });
      return rms(runChain(chainWith(p), sine(100, 1, 0.5)), 20000);
    };
    expect(run(12)).toBeGreaterThan(run(24));
  });

  it('pitch shifting through the chain moves the fundamental', () => {
    const p = flatParams((x) => { x.voice = { ...x.voice, on: true, pitch: 12, formant: 12, mix: 100 }; });
    const out = runChain(chainWith(p), vowel(150, 1.5));
    expect(Math.abs(fundamental(out, 40000) - 300)).toBeLessThan(6);
  });

  it('the limiter holds the ceiling for a hot signal', () => {
    const p = flatParams((x) => { x.lim = { on: true, ceiling: -6, release: 80 }; });
    const out = runChain(chainWith(p), sine(330, 1, 1));
    expect(peak(out, 4000)).toBeLessThanOrEqual(Math.pow(10, -6 / 20) * 1.001);
  });

  it('bypass crossfades to the raw microphone signal', () => {
    const p = flatParams((x) => { x.bypass = true; x.outGain = -24; });
    const input = sine(500, 1, 0.5);
    const out = runChain(chainWith(p), input);
    expect(Math.abs(rms(out, 30000) / rms(input, 30000) - 1)).toBeLessThan(0.02);
  });

  it('applies input gain with smoothing', () => {
    const p = flatParams((x) => { x.inGain = 6; });
    const input = sine(500, 1, 0.1);
    const out = runChain(chainWith(p), input);
    expect(toDb(rms(out, 30000) / rms(input, 30000))).toBeCloseTo(6, 0);
  });

  it('reports latency from the enabled modules', () => {
    const off = chainWith(flatParams());
    expect(off.latencySamples).toBe(0);
    const on = chainWith(flatParams((x) => { x.voice.on = true; x.voice.quality = 1024; x.lim.on = true; }));
    expect(on.latencySamples).toBe(1024 + 97);
  });

  it('takeMeters returns the peaks and then resets them', () => {
    const chain = chainWith(flatParams());
    runChain(chain, sine(500, 0.1, 0.5));
    const first = chain.takeMeters();
    expect(first.inPeak).toBeGreaterThan(0.45);
    expect(chain.takeMeters().inPeak).toBe(0);
  });

  it('survives rapid parameter changes without NaN', () => {
    const chain = new VoiceChain(FS);
    const params = createDefaultParams();
    const input = vowel(130, 2);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 128) {
      if (i % 4096 === 0) {
        params.voice.pitch = Math.sin(i / 20000) * 8;
        params.hpf.freq = 60 + (i % 8192) / 40;
        params.voice.quality = i % 16384 === 0 ? 1024 : 2048;
        chain.setParams({ ...params });
      }
      chain.process(input.subarray(i, i + 128), out.subarray(i, i + 128), 128);
    }
    expect(out.every(Number.isFinite)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it('default settings keep quiet speech-level noise from exploding', () => {
    const out = runChain(chainWith(createDefaultParams()), noise(1, 0.002));
    expect(peak(out)).toBeLessThan(0.05);
  });
});

describe('eqCurveDb', () => {
  it('equals the sum of the active filters and is flat when everything is off', () => {
    const p = createDefaultParams();
    p.hpf.on = false;
    p.eq.on = true;
    expect(eqCurveDb(p, 1000, FS)).toBeCloseTo(0, 6);
    p.eq.bands[2].gain = 6;
    expect(eqCurveDb(p, 1000, FS)).toBeCloseTo(6, 0);
    p.eq.on = false;
    expect(eqCurveDb(p, 1000, FS)).toBeCloseTo(0, 6);
  });

  it('includes the high-pass roll-off', () => {
    const p = createDefaultParams();
    p.hpf = { on: true, freq: 200, slope: 24 };
    expect(eqCurveDb(p, 30, FS)).toBeLessThan(-40);
  });

  it('a disabled band contributes nothing', () => {
    const p = createDefaultParams();
    p.hpf.on = false;
    p.eq.bands[3].gain = 12;
    p.eq.bands[3].on = false;
    expect(eqCurveDb(p, 3000, FS)).toBeCloseTo(0, 6);
  });
});
