import { blockLevelsDb, dbFromLinear, levelStats, type LevelStats } from '@shared/calibration';

export interface ProbeReading {
  /** current level, dB */
  levelDb: number;
  /** highest peak so far, dB */
  peakDb: number;
}

/**
 * Listens to a microphone WITHOUT the studio chain, for the setup wizard's level check.
 * It owns its own MediaStream and AudioContext and cleans both up in `stop()`.
 */
export class MicProbe {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer = new Float32Array(2048);
  private history: number[] = [];
  private peak = 0;

  get running(): boolean {
    return this.ctx !== null;
  }

  async start(deviceId: string): Promise<void> {
    await this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const ctx = new AudioContext();
    // a context created without a user gesture starts suspended and would only ever read silence
    await ctx.resume().catch(() => undefined);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    this.ctx = ctx;
    this.stream = stream;
    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);
    this.history = [];
    this.peak = 0;
  }

  /** Samples the microphone now; call about 20 times a second. */
  read(): ProbeReading {
    if (!this.analyser) return { levelDb: -120, peakDb: -120 };
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    let peak = 0;
    for (const v of this.buffer) {
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const level = dbFromLinear(Math.sqrt(sum / this.buffer.length));
    this.history.push(level);
    if (this.history.length > 1200) this.history.shift();
    if (peak > this.peak) this.peak = peak;
    return { levelDb: level, peakDb: dbFromLinear(this.peak) };
  }

  /** Speech and noise-floor statistics of everything heard since `start()`. */
  stats(): LevelStats {
    return levelStats(this.history);
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    const ctx = this.ctx;
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }
}

/** Convenience for tests and offline analysis. */
export function statsOfSamples(samples: Float32Array, sampleRate: number): LevelStats {
  return levelStats(blockLevelsDb(samples, Math.round(sampleRate * 0.05)));
}
