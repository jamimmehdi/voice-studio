import type { AudioEngine } from '@engine/audio/audio-engine';
import { MeterSmoother, type DisplayMeters } from '@engine/audio/meter-smoother';

type EngineMeterSource = Pick<AudioEngine, 'running' | 'meters'>;
type Listener = (meters: DisplayMeters) => void;

/**
 * Single clock for everything that animates from audio levels (meters, gain-reduction bars,
 * ducking, the compact panel). It uses a timer, not requestAnimationFrame, so it keeps running
 * while the window is hidden in the tray.
 */
export class MeterHub {
  private readonly smoother = new MeterSmoother();
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: DisplayMeters;

  constructor(
    private readonly engine: EngineMeterSource,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.current = this.smoother.update(null, this.now());
  }

  get latest(): DisplayMeters {
    return this.current;
  }

  start(intervalMs = 33): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Advances the smoothing by one step and notifies subscribers. */
  tick(): DisplayMeters {
    const raw = this.engine.running ? this.engine.meters : null;
    this.current = this.smoother.update(raw, this.now());
    this.listeners.forEach((l) => l(this.current));
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
