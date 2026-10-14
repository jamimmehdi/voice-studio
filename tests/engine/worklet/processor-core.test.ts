import { ProcessorCore } from '@engine/worklet/processor-core';
import type { FromWorklet } from '@shared/protocols';
import { createDefaultParams } from '@shared/params';
import { flatParams, FS, rms, sine } from '../../helpers/signals';

interface Harness {
  core: ProcessorCore;
  messages: FromWorklet[];
  transfers: Transferable[][];
}

function harness(): Harness {
  const messages: FromWorklet[] = [];
  const transfers: Transferable[][] = [];
  const core = new ProcessorCore(FS, (m, t) => {
    messages.push(m);
    transfers.push(t ?? []);
  });
  return { core, messages, transfers };
}

const quantum = (fill = 0): Float32Array => new Float32Array(128).fill(fill);

describe('ProcessorCore', () => {
  it('announces itself with the sample rate', () => {
    const { messages } = harness();
    expect(messages[0]).toEqual({ type: 'ready', sampleRate: FS });
  });

  it('writes the same processed mono signal to every output channel', () => {
    const { core } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const input = sine(500, 0.01, 0.5).subarray(0, 128);
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    core.process([input], [left, right], 0);
    expect(right).toEqual(left);
    expect(rms(left)).toBeGreaterThan(0.3);
  });

  it('mixes a stereo input down to mono', () => {
    const { core } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const a = quantum(0.4);
    const b = quantum(0.2);
    const out = new Float32Array(128);
    // let the 10 ms smoothers settle
    for (let i = 0; i < 200; i++) core.process([a, b], [out], i * 128);
    expect(out[64]).toBeCloseTo(0.3, 3);
  });

  it('outputs silence when no input is connected', () => {
    const { core } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const out = new Float32Array(128).fill(1);
    core.process(undefined, [out], 0);
    expect(rms(out)).toBe(0);
  });

  it('posts meters every 8 render quanta', () => {
    const { core, messages } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const out = new Float32Array(128);
    for (let i = 0; i < 24; i++) core.process([quantum(0.1)], [out], i * 128);
    const meters = messages.filter((m) => m.type === 'meters');
    expect(meters).toHaveLength(3);
    const first = meters[0];
    if (first?.type !== 'meters') throw new Error('expected meters');
    expect(first.inPeak).toBeCloseTo(0.1, 3);
    expect(first.dropouts).toBe(0);
  });

  it('counts a dropout when render quanta are skipped', () => {
    const { core, messages } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const out = new Float32Array(128);
    core.process([quantum()], [out], 0);
    core.process([quantum()], [out], 128);
    core.process([quantum()], [out], 128 * 5); // four quanta missing
    for (let i = 3; i < 8; i++) core.process([quantum()], [out], 128 * (i + 3));
    const meters = messages.find((m) => m.type === 'meters');
    if (meters?.type !== 'meters') throw new Error('expected meters');
    expect(meters.dropouts).toBe(1);
  });

  it('records only while asked and transfers 4096-sample chunks', () => {
    const { core, messages, transfers } = harness();
    core.handleMessage({ type: 'params', params: flatParams() });
    const out = new Float32Array(128);
    for (let i = 0; i < 64; i++) core.process([quantum(0.2)], [out], i * 128);
    expect(messages.some((m) => m.type === 'rec')).toBe(false);

    core.handleMessage({ type: 'record', on: true });
    for (let i = 0; i < 64; i++) core.process([quantum(0.2)], [out], (64 + i) * 128); // 8192 samples
    const recs = messages.filter((m) => m.type === 'rec');
    expect(recs).toHaveLength(2);
    const chunk = recs[0];
    if (chunk?.type !== 'rec') throw new Error('expected rec');
    expect(chunk.data).toHaveLength(4096);
    expect(transfers[messages.indexOf(chunk)]).toHaveLength(1);

    core.handleMessage({ type: 'record', on: false });
    const before = messages.length;
    for (let i = 0; i < 64; i++) core.process([quantum(0.2)], [out], (128 + i) * 128);
    expect(messages.slice(before).some((m) => m.type === 'rec')).toBe(false);
  });

  it('applies parameter messages', () => {
    const { core } = harness();
    const params = createDefaultParams();
    params.voice.on = false;
    params.bypass = true;
    core.handleMessage({ type: 'params', params });
    const out = new Float32Array(128);
    for (let i = 0; i < 100; i++) core.process([quantum(0.25)], [out], i * 128);
    expect(out[10]).toBeCloseTo(0.25, 2); // bypass -> raw mic
  });
});
