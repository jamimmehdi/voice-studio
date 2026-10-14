/*
 * AudioWorklet wrapper. The renderer concatenates dsp-core.js + this file
 * and loads the result through a Blob URL, so VoiceDSP is in scope here.
 */
class VoiceStudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = new VoiceDSP.VoiceChain(sampleRate);
    this.mono = new Float32Array(128);
    this.blocks = 0;
    this.lastFrame = -1;
    this.dropouts = 0;
    this.recording = false;
    this.recBuf = new Float32Array(4096);
    this.recPos = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'params') {
        this.chain.setParams(m.params);
      } else if (m.type === 'record') {
        this.recording = !!m.on;
        this.recPos = 0;
      }
    };
    this.port.postMessage({ type: 'ready', sampleRate });
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const n = output[0].length;
    if (this.lastFrame >= 0 && currentFrame - this.lastFrame > n) this.dropouts++;
    this.lastFrame = currentFrame;
    if (this.mono.length < n) this.mono = new Float32Array(n);
    const mono = this.mono;

    if (!input || input.length === 0) {
      mono.fill(0, 0, n);
    } else if (input.length === 1) {
      mono.set(input[0].subarray(0, n));
    } else {
      const a = input[0], b = input[1];
      for (let i = 0; i < n; i++) mono[i] = 0.5 * (a[i] + b[i]);
    }

    const out = output[0];
    this.chain.process(mono, out, n);
    for (let c = 1; c < output.length; c++) output[c].set(out.subarray(0, n));

    if (this.recording) {
      for (let i = 0; i < n; i++) {
        this.recBuf[this.recPos++] = out[i];
        if (this.recPos === this.recBuf.length) {
          const copy = this.recBuf.slice();
          this.port.postMessage({ type: 'rec', data: copy }, [copy.buffer]);
          this.recPos = 0;
        }
      }
    }

    if (++this.blocks % 8 === 0) {
      const m = this.chain.takeMeters();
      m.type = 'meters';
      m.latency = this.chain.latencySamples;
      m.dropouts = this.dropouts;
      this.port.postMessage(m);
    }
    return true;
  }
}
registerProcessor('voice-studio', VoiceStudioProcessor);
