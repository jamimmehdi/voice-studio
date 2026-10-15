import type { FromWorklet, ToWorklet } from '@shared/protocols';
import { VoiceChain } from '../dsp/voice-chain';

export type PostFn = (message: FromWorklet, transfer?: Transferable[]) => void;

const RECORD_CHUNK = 4096;
const METER_EVERY_BLOCKS = 8;

/**
 * Framework-free heart of the AudioWorklet processor: message handling, mono mix-down,
 * dropout detection, metering and recording. `processor.ts` only wires it to the worklet globals,
 * which keeps all of this unit-testable.
 */
export class ProcessorCore {
  private readonly chain: VoiceChain;
  private mono = new Float32Array(128);
  private blocks = 0;
  private lastFrame = -1;
  private dropouts = 0;
  private recording = false;
  private recordRaw = false;
  private recBuf = new Float32Array(RECORD_CHUNK);
  private recPos = 0;
  private rawBuf = new Float32Array(RECORD_CHUNK);
  private rawPos = 0;

  constructor(
    readonly sampleRate: number,
    private readonly post: PostFn,
  ) {
    this.chain = new VoiceChain(sampleRate);
    this.post({ type: 'ready', sampleRate });
  }

  handleMessage(message: ToWorklet): void {
    if (message.type === 'params') {
      this.chain.setParams(message.params);
    } else if (message.type === 'record') {
      this.recording = message.on;
      this.recordRaw = message.on && message.raw === true;
      this.recPos = 0;
      this.rawPos = 0;
    }
  }

  /**
   * @param input  channels of the first input (may be empty when nothing is connected)
   * @param output channels of the first output; every channel receives the processed mono signal
   * @param currentFrame  the context's frame counter, used to detect missed render quanta
   */
  process(input: readonly Float32Array[] | undefined, output: Float32Array[], currentFrame: number): void {
    const first = output[0];
    if (!first) return;
    const n = first.length;

    if (this.lastFrame >= 0 && currentFrame - this.lastFrame > n) this.dropouts++;
    this.lastFrame = currentFrame;

    if (this.mono.length < n) this.mono = new Float32Array(n);
    const mono = this.mono;
    const in0 = input?.[0];
    const in1 = input?.[1];
    if (!in0) {
      mono.fill(0, 0, n);
    } else if (!in1) {
      mono.set(in0.subarray(0, n));
    } else {
      for (let i = 0; i < n; i++) mono[i] = 0.5 * (in0[i]! + in1[i]!);
    }

    this.chain.process(mono, first, n);
    for (let c = 1; c < output.length; c++) output[c]!.set(first.subarray(0, n));

    if (this.recording) {
      this.captureRecording(first, n);
      if (this.recordRaw) this.captureRaw(mono, n);
    }

    if (++this.blocks % METER_EVERY_BLOCKS === 0) {
      this.post({
        type: 'meters',
        ...this.chain.takeMeters(),
        latency: this.chain.latencySamples,
        dropouts: this.dropouts,
      });
    }
  }

  private captureRaw(samples: Float32Array, n: number): void {
    for (let i = 0; i < n; i++) {
      this.rawBuf[this.rawPos++] = samples[i]!;
      if (this.rawPos === RECORD_CHUNK) {
        const copy = this.rawBuf.slice();
        this.post({ type: 'rec', data: copy, raw: true }, [copy.buffer]);
        this.rawPos = 0;
      }
    }
  }

  private captureRecording(samples: Float32Array, n: number): void {
    for (let i = 0; i < n; i++) {
      this.recBuf[this.recPos++] = samples[i]!;
      if (this.recPos === RECORD_CHUNK) {
        const copy = this.recBuf.slice();
        this.post({ type: 'rec', data: copy }, [copy.buffer]);
        this.recPos = 0;
      }
    }
  }
}
