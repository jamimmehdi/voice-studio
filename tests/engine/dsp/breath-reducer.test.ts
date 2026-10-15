import { BreathReducer } from '@engine/dsp/breath-reducer';
import { VoiceChain } from '@engine/dsp/voice-chain';
import { createDefaultParams } from '@shared/params';
import { FS, noise, peak, rms, sine, toDb, vowel } from '../../helpers/signals';

function run(r: BreathReducer, input: Float32Array): Float32Array {
  return input.map((x) => r.process(x));
}

/** A word-like vowel burst followed by silence, repeated. */
function speech(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(FS * seconds));
  const word = vowel(150, 0.3, 0.3);
  for (let at = 0; at + word.length < out.length; at += Math.round(FS * 0.5)) out.set(word, at);
  return out;
}

describe('BreathReducer', () => {
  it('is transparent when both amounts are zero', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 0, breath: 0 });
    const input = speech(2);
    const out = run(r, input);
    expect(Math.abs(rms(out) / rms(input) - 1)).toBeLessThan(0.001);
    expect(r.gainDb).toBeCloseTo(0, 3);
  });

  it('leaves speech essentially untouched at the default amounts', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 60, breath: 50 });
    // measure the loud part of a long vowel
    const input = vowel(140, 1.5, 0.3);
    const out = run(r, input);
    const ratio = rms(out, FS / 2) / rms(input, FS / 2);
    expect(ratio).toBeGreaterThan(0.9);
  });

  it('ducks a very short bright click far below its original peak', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 100, breath: 0 });
    // steady quiet background, then a 1.5 ms click of high frequency energy
    const input = new Float32Array(FS);
    const bed = noise(1, 0.003);
    input.set(bed);
    const at = FS / 2;
    for (let i = 0; i < 72; i++) input[at + i] = (i % 2 === 0 ? 1 : -1) * 0.6;
    const out = run(r, input);
    const before = peak(input, at, at + 72);
    const after = peak(out, at + 12, at + 72);
    expect(after).toBeLessThan(before * 0.5);
    // and the signal recovers afterwards
    expect(rms(out, at + 2000, at + 6000)).toBeGreaterThan(rms(bed, 2000, 6000) * 0.8);
  });

  it('click reduction at 0 lets the click through', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 0, breath: 0 });
    const input = new Float32Array(FS);
    input.set(noise(1, 0.003));
    for (let i = 0; i < 72; i++) input[FS / 2 + i] = (i % 2 === 0 ? 1 : -1) * 0.6;
    const out = run(r, input);
    expect(peak(out, FS / 2, FS / 2 + 72)).toBeGreaterThan(0.55);
  });

  it('turns down a soft, hissy breath that follows loud speech', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 0, breath: 100 });
    // loud vowel (sets the speech reference), then a breath: noise about 20 dB under the speech
    const talk = vowel(140, 1, 0.4);
    const breath = noise(0.8, 0.05);
    const input = new Float32Array(talk.length + breath.length);
    input.set(talk);
    input.set(breath, talk.length);
    const out = run(r, input);
    const from = talk.length + Math.round(FS * 0.3);
    const reduction = toDb(rms(input, from)) - toDb(rms(out, from));
    expect(reduction).toBeGreaterThan(6);
  });

  it('does not touch steady quiet room noise when there was no speech', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 100, breath: 100 });
    const input = noise(2, 0.01);
    const out = run(r, input);
    // no loud reference: the level is never "well below speech", so nothing is ducked much
    expect(toDb(rms(input, FS)) - toDb(rms(out, FS))).toBeLessThan(3);
  });

  it('never produces non-finite output', () => {
    const r = new BreathReducer(FS);
    r.set({ clicks: 100, breath: 100 });
    const wild = sine(7000, 0.5, 1);
    const out = run(r, wild);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('VoiceChain with breath & clicks', () => {
  function process(chain: VoiceChain, input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 128) {
      const n = Math.min(128, input.length - i);
      chain.process(input.subarray(i, i + n), out.subarray(i, i + n), n);
    }
    return out;
  }

  it('runs in the chain without breaking the signal', () => {
    const chain = new VoiceChain(FS);
    const p = createDefaultParams();
    p.breath = { on: true, clicks: 80, breath: 70 };
    chain.setParams(p);
    const out = process(chain, speech(2));
    expect(out.every(Number.isFinite)).toBe(true);
    expect(rms(out, FS)).toBeGreaterThan(0.01);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it('is off by default and clamps hostile amounts', () => {
    expect(createDefaultParams().breath.on).toBe(false);
    const r = new BreathReducer(FS);
    r.set({ clicks: 9999, breath: -50 });
    expect(Number.isFinite(run(r, sine(300, 0.1, 0.2))[100]!)).toBe(true);
  });
});
