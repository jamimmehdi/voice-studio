import { AudioEngine, type EngineStartOptions } from '@engine/audio/audio-engine';
import { MusicBus } from '@engine/audio/music-bus';
import { createDefaultParams } from '@shared/params';

/* ---- minimal Web Audio fakes: they record how the graph is wired ---- */

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn();
}

class FakeNode {
  connections: unknown[] = [];
  connect = vi.fn((target: unknown) => {
    this.connections.push(target);
    return target;
  });
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeAnalyser extends FakeNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  frequencyBinCount = 0;
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode | null = null;
  port = { postMessage: vi.fn(), onmessage: null as ((e: { data: unknown }) => void) | null };
  constructor(
    public ctx: unknown,
    public name: string,
    public options: unknown,
  ) {
    super();
    FakeWorkletNode.last = this;
  }
  emit(data: unknown): void {
    this.port.onmessage?.({ data });
  }
}

class FakeContext {
  static last: FakeContext | null = null;
  static failModule = false;
  destination = new FakeNode();
  sampleRate = 48000;
  baseLatency = 0.01;
  outputLatency = 0.02;
  currentTime = 0;
  state = 'running';
  audioWorklet = {
    addModule: vi.fn(async () => {
      if (FakeContext.failModule) throw new Error('bad module');
    }),
  };
  setSinkId = vi.fn(async (_id: string) => undefined);
  close = vi.fn(async () => undefined);
  gains: FakeGain[] = [];
  constructor(public options: unknown) {
    FakeContext.last = this;
  }
  createMediaStreamSource = vi.fn(() => new FakeNode());
  createAnalyser = vi.fn(() => new FakeAnalyser());
  createGain = vi.fn(() => {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  });
  createMediaStreamDestination = vi.fn(() => Object.assign(new FakeNode(), { stream: { id: 'monitor' } }));
  createMediaElementSource = vi.fn(() => new FakeNode());
  createDynamicsCompressor = vi.fn(() => new FakeCompressor());
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  srcObject: unknown = null;
  src = '';
  preload = '';
  paused = true;
  setSinkId = vi.fn(async (_id: string) => undefined);
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();
  constructor() {
    FakeAudio.instances.push(this);
  }
}

const stopTrack = vi.fn();
const getUserMedia = vi.fn(async (_c: unknown) => ({ getTracks: () => [{ stop: stopTrack }] }));

beforeEach(() => {
  FakeContext.failModule = false;
  FakeContext.last = null;
  FakeWorkletNode.last = null;
  FakeAudio.instances = [];
  stopTrack.mockClear();
  getUserMedia.mockClear();
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:worklet');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const options = (over: Partial<EngineStartOptions> = {}): EngineStartOptions => ({
  workletSource: '/* worklet */',
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  monitorDeviceId: 'default',
  noiseSuppression: false,
  autoGainControl: false,
  latencyHint: 'interactive',
  params: createDefaultParams(),
  monitor: { on: false, volume: 0.8 },
  musicVolume: 0.6,
  ...over,
});

describe('AudioEngine', () => {
  it('builds the graph, sends the parameters and announces itself', async () => {
    const engine = new AudioEngine();
    const running: boolean[] = [];
    const buses: unknown[] = [];
    engine.events.on('running', (r) => running.push(r));
    engine.events.on('musicBus', (b) => buses.push(b));

    const params = createDefaultParams();
    params.voice.pitch = 4.5;
    await engine.start(options({ params, latencyHint: 'playback' }));

    expect(engine.running).toBe(true);
    expect((FakeContext.last!.options as { latencyHint: string }).latencyHint).toBe('playback');
    expect(FakeContext.last!.audioWorklet.addModule).toHaveBeenCalledWith('blob:worklet');
    expect(FakeWorkletNode.last!.name).toBe('voice-studio');
    expect(FakeWorkletNode.last!.port.postMessage).toHaveBeenCalledWith({ type: 'params', params });
    // the voice reaches the destination through its own gain (so a soundboard clip can lower it)
    const voiceGain = FakeContext.last!.gains[0]!;
    expect(FakeWorkletNode.last!.connections).toContain(voiceGain);
    expect(voiceGain.connections).toContain(FakeContext.last!.destination);
    expect(running).toEqual([true]);
    expect(buses[0]).toBeInstanceOf(MusicBus);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:worklet');
  });

  it('asks for a clean microphone stream with the requested device', async () => {
    const engine = new AudioEngine();
    await engine.start(options({ inputDeviceId: 'mic-7', noiseSuppression: true, autoGainControl: true }));
    const constraints = getUserMedia.mock.calls[0]![0] as { audio: Record<string, unknown> };
    expect(constraints.audio).toMatchObject({
      deviceId: { exact: 'mic-7' },
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  });

  it('uses the default device without an "exact" constraint', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    const constraints = getUserMedia.mock.calls[0]![0] as { audio: { deviceId: unknown } };
    expect(constraints.audio.deviceId).toBeUndefined();
  });

  it('routes output and monitor to the chosen devices', async () => {
    const engine = new AudioEngine();
    await engine.start(options({ outputDeviceId: 'cable', monitorDeviceId: 'headset' }));
    expect(FakeContext.last!.setSinkId).toHaveBeenCalledWith('cable');
    expect(FakeAudio.instances[0]!.setSinkId).toHaveBeenCalledWith('headset');
  });

  it('is a no-op when started twice', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    await engine.start(options());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('releases everything and rethrows when the microphone is unavailable', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotFoundError'));
    const engine = new AudioEngine();
    await expect(engine.start(options())).rejects.toThrow('NotFoundError');
    expect(engine.running).toBe(false);
    expect(FakeContext.last!.close).toHaveBeenCalled();
  });

  it('stops the tracks when the worklet cannot be loaded after the stream opened', async () => {
    const engine = new AudioEngine();
    FakeContext.failModule = true;
    await expect(engine.start(options())).rejects.toThrow('bad module');
    expect(engine.running).toBe(false);
  });

  it('stop closes the context, stops the microphone and announces the change', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    const ctx = FakeContext.last!;
    const events: string[] = [];
    engine.events.on('running', (r) => events.push(`running:${r}`));
    engine.events.on('musicBus', (b) => events.push(`bus:${b ? 'new' : 'none'}`));

    await engine.stop();
    expect(engine.running).toBe(false);
    expect(ctx.close).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    expect(events).toEqual(['bus:none', 'running:false']);
    await engine.stop(); // idempotent
  });

  it('turns worklet meter messages into events and a latency estimate', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    const seen: number[] = [];
    engine.events.on('meters', (m) => seen.push(m.inPeak));
    FakeWorkletNode.last!.emit({
      type: 'meters',
      inPeak: 0.4,
      outPeak: 0.3,
      exp: 0,
      deess: 0,
      comp: -3,
      lim: 0,
      latency: 2145,
      dropouts: 2,
    });
    expect(seen).toEqual([0.4]);
    expect(engine.meters).toMatchObject({ inPeak: 0.4, comp: -3, latencySamples: 2145, dropouts: 2 });
    // (2145 / 48000 + 0.01 + 0.02) * 1000 = 74.7
    expect(engine.latencyMs).toBe(75);
  });

  it('monitor gain follows on / volume and the music bus gets the initial volume', async () => {
    const engine = new AudioEngine();
    await engine.start(options({ monitor: { on: true, volume: 0.5 } }));
    const ctx = FakeContext.last!;
    // gains created in order: voice, monitor, music volume, duck, monitor-of-music, sound input
    expect(ctx.gains[1]!.gain.value).toBe(0.5);
    expect(ctx.gains[2]!.gain.value).toBe(0.6);
    engine.setMonitor(false, 0.5);
    expect(ctx.gains[1]!.gain.value).toBe(0);
    engine.setMonitor(true, 0.9);
    expect(ctx.gains[1]!.gain.value).toBe(0.9);
  });

  it('retargets the output and monitor devices live; "default" clears the sink', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    await engine.setOutputDevice('speakers');
    await engine.setOutputDevice('default');
    expect(FakeContext.last!.setSinkId.mock.calls.map((c) => c[0])).toEqual(['speakers', '']);
    await engine.setMonitorDevice('hp');
    expect(FakeAudio.instances[0]!.setSinkId).toHaveBeenCalledWith('hp');
  });

  it('records chunks between start and stop', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    expect(engine.stopRecording()).toBeNull();

    engine.startRecording();
    expect(engine.isRecording).toBe(true);
    expect(FakeWorkletNode.last!.port.postMessage).toHaveBeenCalledWith({ type: 'record', on: true });
    FakeWorkletNode.last!.emit({ type: 'rec', data: new Float32Array([0.1, 0.2]) });
    FakeWorkletNode.last!.emit({ type: 'rec', data: new Float32Array([0.3]) });

    const result = engine.stopRecording()!;
    expect(result.sampleRate).toBe(48000);
    expect(result.chunks.map((c) => c.length)).toEqual([2, 1]);
    expect(engine.isRecording).toBe(false);
    FakeWorkletNode.last!.emit({ type: 'rec', data: new Float32Array([9]) }); // ignored
  });

  it('cannot record while stopped', () => {
    const engine = new AudioEngine();
    engine.startRecording();
    expect(engine.isRecording).toBe(false);
  });

  it('setParams posts to the worklet', async () => {
    const engine = new AudioEngine();
    await engine.start(options());
    const p = createDefaultParams();
    p.hpf.freq = 123;
    engine.setParams(p);
    expect(FakeWorkletNode.last!.port.postMessage).toHaveBeenLastCalledWith({ type: 'params', params: p });
  });
});

describe('MusicBus', () => {
  it('wires volume -> duck -> limiter -> destination and a separate monitor path', () => {
    const ctx = new FakeContext({});
    const monitorDest = new FakeNode();
    const bus = new MusicBus(ctx as unknown as AudioContext, monitorDest as unknown as AudioNode, 0.4);
    const [volume, duck, monitor] = ctx.gains;
    expect(volume!.gain.value).toBe(0.4);
    expect(volume!.connections).toContain(duck);
    expect(volume!.connections).toContain(monitor);
    expect(monitor!.connections).toContain(monitorDest);
    expect(bus.element).toBeInstanceOf(FakeAudio);
  });

  it('clamps the volume and smooths the duck gain', () => {
    const ctx = new FakeContext({});
    const bus = new MusicBus(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode, 1);
    bus.setVolume(5);
    expect(ctx.gains[0]!.gain.value).toBe(1);
    bus.setVolume(-1);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    bus.setDuck(0.3, 0.04);
    expect(ctx.gains[1]!.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.04);
  });

  it('dispose pauses and unloads the element', () => {
    const ctx = new FakeContext({});
    const bus = new MusicBus(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode, 1);
    bus.dispose();
    const el = bus.element as unknown as FakeAudio;
    expect(el.pause).toHaveBeenCalled();
    expect(el.removeAttribute).toHaveBeenCalledWith('src');
    expect(el.load).toHaveBeenCalled();
  });
});
