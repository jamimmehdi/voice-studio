import { AutoBuffer, nextSaferBuffer } from '@engine/audio/auto-buffer';
import { SoundPlayer } from '@engine/audio/sound-player';
import { ProcessorCore } from '@engine/worklet/processor-core';
import { createDefaultParams } from '@shared/params';
import type { FromWorklet } from '@shared/protocols';

describe('AutoBuffer', () => {
  it('steps towards the safest buffer', () => {
    expect(nextSaferBuffer('low')).toBe('balanced');
    expect(nextSaferBuffer('balanced')).toBe('safe');
    expect(nextSaferBuffer('safe')).toBeNull();
  });

  it('stays quiet while dropouts are rare', () => {
    const a = new AutoBuffer();
    expect(a.observe(0, 0, 'balanced')).toBeNull();
    expect(a.observe(1, 5_000, 'balanced')).toBeNull();
    expect(a.observe(2, 10_000, 'balanced')).toBeNull();
  });

  it('raises the buffer after a burst of dropouts, then waits', () => {
    const a = new AutoBuffer({ threshold: 3, windowMs: 20_000, cooldownMs: 45_000 });
    a.observe(0, 0, 'balanced');
    const change = a.observe(4, 5_000, 'balanced');
    expect(change).toMatchObject({ from: 'balanced', to: 'safe', dropouts: 4 });
    // cooldown: another burst right away does not change anything
    a.observe(5, 6_000, 'safe');
    expect(a.observe(12, 8_000, 'low')).toBeNull();
  });

  it('never goes past safe', () => {
    const a = new AutoBuffer();
    a.observe(0, 0, 'safe');
    expect(a.observe(50, 1_000, 'safe')).toBeNull();
  });

  it('ignores old dropouts that left the window and can be reset', () => {
    const a = new AutoBuffer({ threshold: 3, windowMs: 10_000, cooldownMs: 0 });
    a.observe(0, 0, 'low');
    a.observe(2, 5_000, 'low');
    // 30 s later the counter moved by only 1 inside the window
    expect(a.observe(3, 35_000, 'low')).toBeNull();
    a.reset();
    expect(a.observe(100, 40_000, 'low')).toBeNull(); // first sample after a reset is the baseline
  });
});

class FakeBuffer {
  duration = 1.5;
}

class FakeSource {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn(() => {
    this.started = true;
  });
  stop = vi.fn(() => {
    this.stopped = true;
    this.onended?.();
  });
}

function fakeTarget() {
  const sources: FakeSource[] = [];
  const decode = vi.fn(async () => new FakeBuffer());
  const context = {
    decodeAudioData: decode,
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
  };
  return { sources, decode, target: { context: context as never, destination: {} as never } };
}

describe('SoundPlayer', () => {
  const bytes = (): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(8));

  it('does nothing while no engine is attached', async () => {
    const p = new SoundPlayer();
    expect(await p.play('a', bytes)).toBeNull();
    expect(p.ready).toBe(false);
  });

  it('decodes once, plays, and reports what is playing', async () => {
    const { sources, decode, target } = fakeTarget();
    const p = new SoundPlayer();
    p.attach(target);
    const seen: string[][] = [];
    p.events.on('playing', (ids) => seen.push([...ids]));
    const load = vi.fn(bytes);

    expect(await p.play('a', load)).toBe(1.5);
    expect(await p.play('a', load)).toBe(1.5);
    expect(load).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(sources[0]!.stopped).toBe(true); // restarting a clip stops the earlier instance
    expect(p.playing).toEqual(['a']);

    sources[1]!.onended?.();
    expect(p.playing).toEqual([]);
    expect(seen.at(-1)).toEqual([]);
  });

  it('lets different clips overlap and stops all of them', async () => {
    const { target } = fakeTarget();
    const p = new SoundPlayer();
    p.attach(target);
    await p.play('a', bytes);
    await p.play('b', bytes);
    expect([...p.playing].sort()).toEqual(['a', 'b']);
    p.stopAll();
    expect(p.playing).toEqual([]);
  });

  it('gives up cleanly when a clip is missing and stops everything on detach', async () => {
    const { target } = fakeTarget();
    const p = new SoundPlayer();
    p.attach(target);
    expect(await p.play('gone', async () => null)).toBeNull();
    await p.play('a', bytes);
    p.attach(null);
    expect(p.playing).toEqual([]);
  });

  it('forget() drops the cached buffer', async () => {
    const { target, decode } = fakeTarget();
    const p = new SoundPlayer();
    p.attach(target);
    await p.play('a', bytes);
    p.forget('a');
    await p.play('a', bytes);
    expect(decode).toHaveBeenCalledTimes(2);
  });
});

describe('ProcessorCore: raw capture', () => {
  it('records the raw microphone next to the processed output when asked', () => {
    const posted: FromWorklet[] = [];
    const core = new ProcessorCore(48000, (m) => posted.push(m));
    const p = createDefaultParams();
    p.voice.on = false;
    p.lim.on = false;
    core.handleMessage({ type: 'params', params: p });
    core.handleMessage({ type: 'record', on: true, raw: true });

    const input = [new Float32Array(128).fill(0.25)];
    const out = [new Float32Array(128), new Float32Array(128)];
    for (let i = 0; i < 40; i++) core.process(input, out, i * 128);

    const chunks = posted.filter((m): m is Extract<FromWorklet, { type: 'rec' }> => m.type === 'rec');
    expect(chunks.some((c) => c.raw === true)).toBe(true);
    expect(chunks.some((c) => !c.raw)).toBe(true);
    const raw = chunks.find((c) => c.raw)!;
    expect(raw.data[0]).toBeCloseTo(0.25, 5);
  });

  it('a plain recording does not produce raw chunks', () => {
    const posted: FromWorklet[] = [];
    const core = new ProcessorCore(48000, (m) => posted.push(m));
    core.handleMessage({ type: 'record', on: true });
    const input = [new Float32Array(128).fill(0.1)];
    const out = [new Float32Array(128), new Float32Array(128)];
    for (let i = 0; i < 40; i++) core.process(input, out, i * 128);
    expect(posted.some((m) => m.type === 'rec' && m.raw)).toBe(false);
  });
});
