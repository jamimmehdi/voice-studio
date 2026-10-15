import { Effects } from '@engine/dsp/effects';
import { NoiseSuppressor } from '@engine/dsp/noise-suppressor';
import { VoiceChain } from '@engine/dsp/voice-chain';
import { createDefaultParams, type FxParams } from '@shared/params';
import { FS, noise, peak, rms, sine, toDb, vowel } from '../../helpers/signals';

function mix(a: Float32Array, b: Float32Array): Float32Array {
  return a.map((x, i) => x + (b[i] ?? 0));
}

describe('NoiseSuppressor', () => {
  it('removes a steady noise floor by well over 10 dB', () => {
    const ns = new NoiseSuppressor();
    ns.setAmount(100);
    const hiss = noise(3, 0.02);
    const out = hiss.map((x) => ns.process(x));
    const before = toDb(rms(hiss, FS * 1.5));
    const after = toDb(rms(out, FS * 1.5));
    expect(before - after).toBeGreaterThan(12);
  });

  it('leaves a loud voice-like signal mostly intact', () => {
    const ns = new NoiseSuppressor();
    ns.setAmount(70);
    const bed = noise(4, 0.01);
    // speech-like: 250 ms words separated by 150 ms pauses
    const speech = new Float32Array(FS * 4);
    const word = vowel(140, 0.25, 0.3);
    for (let start = 0; start + word.length < speech.length; start += Math.round(FS * 0.4)) {
      speech.set(word, start);
    }
    const voice = mix(speech, bed);
    const out = voice.map((x) => ns.process(x));
    // judge the loud parts only, after the learning phase
    let inEnergy = 0;
    let outEnergy = 0;
    for (let i = FS; i < voice.length - 512; i++) {
      if (Math.abs(speech[i]!) > 0.05) {
        inEnergy += voice[i]! ** 2;
        outEnergy += out[i + 512]! ** 2;
      }
    }
    const ratio = Math.sqrt(outEnergy / inEnergy);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.2);
  });

  it('reduces the noise under speech compared with the noisy input', () => {
    const ns = new NoiseSuppressor();
    ns.setAmount(90);
    // 2 s of room noise, then speech over the same noise
    const bed = noise(5, 0.02);
    const speech = new Float32Array(FS * 5);
    const word = vowel(130, 0.3, 0.25);
    for (let start = FS * 2; start + word.length < speech.length; start += Math.round(FS * 0.45)) {
      speech.set(word, start);
    }
    const input = mix(bed, speech);
    const out = input.map((x) => ns.process(x));
    // the noise-only part after learning is quieter than the input
    expect(toDb(rms(input, FS, FS * 2)) - toDb(rms(out, FS, FS * 2))).toBeGreaterThan(8);
    // and speech still comes through
    expect(peak(out, FS * 2, FS * 5)).toBeGreaterThan(peak(word) * 0.6);
  });

  it('amount = 0 is nearly transparent and the latency is one frame', () => {
    const ns = new NoiseSuppressor();
    ns.setAmount(0);
    expect(ns.latency).toBe(512);
    const tone = mix(vowel(150, 2, 0.2), noise(2, 0.02));
    const out = tone.map((x) => ns.process(x));
    const ratio = rms(out, FS) / rms(tone, FS);
    expect(ratio).toBeGreaterThan(0.85);
  });

  it('never produces NaN or runaway output', () => {
    const ns = new NoiseSuppressor();
    ns.setAmount(100);
    const wild = new Float32Array(FS);
    for (let i = 0; i < wild.length; i++) wild[i] = i % 977 === 0 ? 1 : (Math.random() - 0.5) * 2;
    const out = wild.map((x) => ns.process(x));
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(peak(out)).toBeLessThan(8);
  });
});

describe('Effects', () => {
  const base: FxParams = { on: true, character: 'none', reverb: 0, echo: 0, chorus: 0 };

  function run(params: FxParams, input: Float32Array): Float32Array {
    const fx = new Effects(FS);
    fx.set(params);
    return input.map((x) => fx.process(x));
  }

  it('is transparent with no character and no wet amounts', () => {
    const input = sine(440, 0.5, 0.3);
    const out = run(base, input);
    expect(Math.abs(rms(out) / rms(input) - 1)).toBeLessThan(1e-6);
  });

  it('reverb leaves a tail after the input stops', () => {
    const burst = new Float32Array(FS * 1.5);
    burst.set(sine(500, 0.2, 0.5));
    const dry = run(base, burst);
    const wet = run({ ...base, reverb: 60 }, burst);
    expect(rms(dry, FS * 0.4, FS * 1.2)).toBe(0);
    expect(rms(wet, FS * 0.4, FS * 1.2)).toBeGreaterThan(1e-4);
  });

  it('echo repeats the input about 280 ms later', () => {
    const click = new Float32Array(FS);
    click[100] = 1;
    const out = run({ ...base, echo: 100 }, click);
    const at = 100 + Math.round(FS * 0.28);
    let best = 0;
    for (let i = at - 5; i < at + 5; i++) best = Math.max(best, Math.abs(out[i]!));
    expect(best).toBeGreaterThan(0.05);
  });

  it('chorus stays stable and level-matched', () => {
    const input = sine(300, 1, 0.3);
    const out = run({ ...base, chorus: 100 }, input);
    expect(peak(out)).toBeLessThan(0.7);
    expect(rms(out, FS / 2)).toBeGreaterThan(rms(input, FS / 2) * 0.5);
  });

  it('character filters band-limit the voice', () => {
    const low = sine(120, 0.5, 0.4);
    const mid = sine(1200, 0.5, 0.4);
    const high = sine(9000, 0.5, 0.4);
    for (const character of ['radio', 'megaphone', 'walkie'] as const) {
      const p = { ...base, character };
      const lowOut = rms(run(p, low), FS / 4);
      const midOut = rms(run(p, mid), FS / 4);
      const highOut = rms(run(p, high), FS / 4);
      expect(midOut, character).toBeGreaterThan(lowOut * 2);
      expect(midOut, character).toBeGreaterThan(highOut * 2);
    }
  });
});

describe('VoiceChain with the new stages', () => {
  function process(chain: VoiceChain, input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 128) {
      const n = Math.min(128, input.length - i);
      chain.process(input.subarray(i, i + n), out.subarray(i, i + n), n);
    }
    return out;
  }

  it('adds the noise suppressor latency only while it is on', () => {
    const chain = new VoiceChain(FS);
    const p = createDefaultParams();
    p.voice.on = false;
    p.lim.on = false;
    chain.setParams(p);
    expect(chain.latencySamples).toBe(0);
    p.noise.on = true;
    chain.setParams({ ...p, noise: { ...p.noise } });
    expect(chain.latencySamples).toBe(512);
  });

  it('supports the 4096-sample Studio quality', () => {
    const chain = new VoiceChain(FS);
    const p = createDefaultParams();
    p.voice.quality = 4096;
    p.voice.pitch = 4;
    chain.setParams(p);
    expect(chain.latencySamples).toBeGreaterThanOrEqual(4096);
    const out = process(chain, vowel(120, 1.5, 0.2));
    expect(out.every(Number.isFinite)).toBe(true);
    expect(rms(out, FS)).toBeGreaterThan(0.01);
  });

  it('runs noise removal and effects in the chain without blowing up', () => {
    const chain = new VoiceChain(FS);
    const p = createDefaultParams();
    p.noise = { on: true, amount: 80 };
    p.fx = { on: true, character: 'walkie', reverb: 30, echo: 20, chorus: 20 };
    chain.setParams(p);
    const out = process(chain, mix(vowel(180, 2, 0.25), noise(2, 0.01)));
    expect(out.every(Number.isFinite)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });
});
