import { FeedbackDetector } from '@engine/audio/feedback-detector';
import type { StudioStoreApi } from '../store/studio-store';

export interface FeedbackGuardDeps {
  store: StudioStoreApi;
  /** the analyser behind the engine's output, or null while the engine is stopped */
  getAnalyser(): Pick<AnalyserNode, 'frequencyBinCount' | 'getFloatFrequencyData'> | null;
  sampleRate(): number;
  intervalMs?: number;
}

/** Switches "Hear myself" off, with an explanation, when the monitor path starts to howl. */
export class FeedbackGuard {
  private detector: FeedbackDetector | null = null;
  private buffer = new Float32Array(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: FeedbackGuardDeps) {}

  start(): () => void {
    this.timer = setInterval(() => this.tick(), this.deps.intervalMs ?? 100);
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
  }

  /** exposed for tests */
  tick(): boolean {
    const { store, getAnalyser, sampleRate } = this.deps;
    const s = store.getState();
    const analyser = s.engine === 'running' && s.monitor.on ? getAnalyser() : null;
    if (!analyser) {
      this.detector?.reset();
      return false;
    }
    const bins = analyser.frequencyBinCount;
    if (this.buffer.length !== bins) this.buffer = new Float32Array(bins);
    if (!this.detector) this.detector = new FeedbackDetector({ binHz: sampleRate() / 2 / bins });
    analyser.getFloatFrequencyData(this.buffer);
    if (!this.detector.feed(this.buffer)) return false;

    this.detector.reset();
    s.setMonitor({ on: false });
    s.setNotice(
      'warn',
      'Feedback detected, so Hear myself was switched off. Use headphones as the monitor device, or turn the monitor volume down.',
    );
    return true;
  }
}
