/**
 * AudioWorklet entry point. Bundled by esbuild into one self-contained script
 * (see scripts/build-worklet.mjs) and loaded through a Blob URL by the renderer.
 */
import type { ToWorklet } from '@shared/protocols';
import { PROCESSOR_NAME } from './constants';
import { ProcessorCore } from './processor-core';

// Minimal typings for the AudioWorkletGlobalScope (not part of lib.dom).
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class VoiceStudioProcessor extends AudioWorkletProcessor {
  private readonly core: ProcessorCore;

  constructor() {
    super();
    this.core = new ProcessorCore(sampleRate, (message, transfer) => {
      this.port.postMessage(message, transfer ?? []);
    });
    this.port.onmessage = (event: MessageEvent<ToWorklet>) => this.core.handleMessage(event.data);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (output) this.core.process(inputs[0], output, currentFrame);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, VoiceStudioProcessor);
