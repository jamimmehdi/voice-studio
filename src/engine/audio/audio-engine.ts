import type { StudioParams } from '@shared/params';
import type { FromWorklet, MeterSnapshot, ToWorklet } from '@shared/protocols';
import { PROCESSOR_NAME } from '../worklet/constants';
import { Emitter } from './emitter';
import { MusicBus } from './music-bus';

export type LatencyHint = 'interactive' | 'balanced' | 'playback';

export interface EngineStartOptions {
  /** self-contained worklet script (see scripts/build-worklet.mjs) */
  workletSource: string;
  inputDeviceId: string;
  outputDeviceId: string;
  monitorDeviceId: string;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  latencyHint: LatencyHint;
  params: StudioParams;
  monitor: { on: boolean; volume: number };
  musicVolume: number;
}

export interface EngineMeters extends MeterSnapshot {
  /** processing latency of the chain in samples */
  latencySamples: number;
  dropouts: number;
}

export interface EngineEvents {
  running: boolean;
  meters: EngineMeters;
  /** a new music bus exists (engine started) or null (engine stopped) */
  musicBus: MusicBus | null;
  /** the microphone stream ended by itself (unplugged, disabled, taken over) */
  inputLost: null;
}

type SinkTarget = { setSinkId?: (id: string) => Promise<void> };

/** setSinkId exists on AudioContext and media elements in Chromium; typed loosely on purpose. */
async function setSink(target: object, deviceId: string): Promise<void> {
  const t = target as SinkTarget;
  if (typeof t.setSinkId === 'function') await t.setSinkId(deviceId === 'default' ? '' : deviceId);
}

/**
 * Owns the Web Audio graph: microphone -> worklet (all DSP) -> virtual cable, plus the headphone
 * monitor, the music bus and the WAV recorder. Contains no React and no UI state.
 */
export class AudioEngine {
  readonly events = new Emitter<EngineEvents>();

  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private analyserNode: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;
  private monitorElement: HTMLAudioElement | null = null;
  private bus: MusicBus | null = null;
  private recording: Float32Array[] | null = null;
  private capture: { raw: Float32Array[]; processed: Float32Array[] } | null = null;
  private voiceGain: GainNode | null = null;
  private lastMeters: EngineMeters | null = null;

  get running(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  get musicBus(): MusicBus | null {
    return this.bus;
  }

  get meters(): EngineMeters | null {
    return this.lastMeters;
  }

  get isRecording(): boolean {
    return this.recording !== null;
  }

  /** Total latency estimate in ms: DSP chain + context buffers. */
  get latencyMs(): number {
    if (!this.ctx || !this.lastMeters) return 0;
    const buffers = this.ctx.baseLatency + (this.ctx.outputLatency || 0);
    return Math.round((this.lastMeters.latencySamples / this.ctx.sampleRate + buffers) * 1000);
  }

  async start(opts: EngineStartOptions): Promise<void> {
    if (this.ctx) return;
    const url = URL.createObjectURL(new Blob([opts.workletSource], { type: 'text/javascript' }));
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      ctx = new AudioContext({ latencyHint: opts.latencyHint });
      if (opts.outputDeviceId !== 'default') await setSink(ctx, opts.outputDeviceId);
      await ctx.audioWorklet.addModule(url);

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: opts.inputDeviceId !== 'default' ? { exact: opts.inputDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: opts.noiseSuppression,
          autoGainControl: opts.autoGainControl,
          channelCount: 1,
        },
      });

      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.stream === stream) this.events.emit('inputLost', null);
        });
      }

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.75;

      // the voice reaches the cable through its own gain so a playing sound can lower it
      const voiceGain = ctx.createGain();
      source.connect(node);
      node.connect(analyser);
      node.connect(voiceGain);
      voiceGain.connect(ctx.destination);

      // headphone monitor on its own output device (voice + music)
      const monitorDest = ctx.createMediaStreamDestination();
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = opts.monitor.on ? opts.monitor.volume : 0;
      node.connect(monitorGain);
      monitorGain.connect(monitorDest);
      const monitorEl = new Audio();
      monitorEl.srcObject = monitorDest.stream;
      if (opts.monitorDeviceId !== 'default') {
        try {
          await setSink(monitorEl, opts.monitorDeviceId);
        } catch {
          /* keep the default device */
        }
      }
      await monitorEl.play();

      const bus = new MusicBus(ctx, monitorDest, opts.musicVolume);

      node.port.onmessage = (event: MessageEvent<FromWorklet>) => this.onWorkletMessage(event.data);
      this.ctx = ctx;
      this.node = node;
      this.stream = stream;
      this.analyserNode = analyser;
      this.voiceGain = voiceGain;
      this.monitorGain = monitorGain;
      this.monitorElement = monitorEl;
      this.bus = bus;
      this.lastMeters = null;

      this.send({ type: 'params', params: opts.params });
      this.events.emit('musicBus', bus);
      this.events.emit('running', true);
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) await ctx.close().catch(() => undefined);
      this.reset();
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async stop(): Promise<void> {
    if (!this.ctx) return;
    this.recording = null;
    const ctx = this.ctx;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.monitorElement?.pause();
    this.bus?.dispose();
    try {
      this.node?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.reset();
    await ctx.close().catch(() => undefined);
    this.events.emit('musicBus', null);
    this.events.emit('running', false);
  }

  private reset(): void {
    this.ctx = null;
    this.node = null;
    this.stream = null;
    this.analyserNode = null;
    this.voiceGain = null;
    this.capture = null;
    this.monitorGain = null;
    this.monitorElement = null;
    this.bus = null;
    this.lastMeters = null;
  }

  private send(message: ToWorklet): void {
    this.node?.port.postMessage(message);
  }

  private onWorkletMessage(message: FromWorklet): void {
    switch (message.type) {
      case 'meters': {
        const { type: _type, latency, dropouts, ...rest } = message;
        const meters: EngineMeters = { ...rest, latencySamples: latency, dropouts };
        this.lastMeters = meters;
        this.events.emit('meters', meters);
        break;
      }
      case 'rec':
        if (message.raw) this.capture?.raw.push(message.data);
        else {
          this.recording?.push(message.data);
          this.capture?.processed.push(message.data);
        }
        break;
      case 'ready':
        break;
    }
  }

  setParams(params: StudioParams): void {
    this.send({ type: 'params', params });
  }

  setMonitor(on: boolean, volume: number): void {
    if (this.monitorGain) this.monitorGain.gain.value = on ? volume : 0;
  }

  async setMonitorDevice(deviceId: string): Promise<void> {
    if (this.monitorElement) await setSink(this.monitorElement, deviceId);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.ctx) await setSink(this.ctx, deviceId);
  }

  /** Lowers (or restores) the voice that goes to the cable; used while a soundboard clip plays. */
  setVoiceLevel(gain: number, timeConstant = 0.05): void {
    if (this.voiceGain && this.ctx)
      this.voiceGain.gain.setTargetAtTime(gain, this.ctx.currentTime, timeConstant);
  }

  /** Starts capturing the raw microphone and the processed voice side by side. */
  startCapture(): boolean {
    if (!this.node || this.capture || this.recording) return false;
    this.capture = { raw: [], processed: [] };
    this.send({ type: 'record', on: true, raw: true });
    return true;
  }

  /** Stops the capture and returns both signals as one buffer each. */
  stopCapture(): { raw: Float32Array; processed: Float32Array; sampleRate: number } | null {
    const capture = this.capture;
    if (!capture || !this.ctx) return null;
    this.send({ type: 'record', on: false });
    this.capture = null;
    const join = (chunks: Float32Array[]): Float32Array => {
      const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      return out;
    };
    return { raw: join(capture.raw), processed: join(capture.processed), sampleRate: this.ctx.sampleRate };
  }

  get isCapturing(): boolean {
    return this.capture !== null;
  }

  startRecording(): void {
    if (!this.node || this.recording || this.capture) return;
    this.recording = [];
    this.send({ type: 'record', on: true });
  }

  /** Stops recording and returns the captured mono chunks plus their sample rate. */
  stopRecording(): { chunks: Float32Array[]; sampleRate: number } | null {
    if (!this.recording || !this.ctx) return null;
    this.send({ type: 'record', on: false });
    const chunks = this.recording;
    this.recording = null;
    return { chunks, sampleRate: this.ctx.sampleRate };
  }
}
