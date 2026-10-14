export interface DuckSettings {
  enabled: boolean;
  /** linear mic peak above which we consider the user to be speaking */
  threshold: number;
  /** gain applied to the music while speaking */
  duckedGain: number;
  /** keep ducked this long after the last speech (ms) */
  holdMs: number;
}

export const DEFAULT_DUCKING: DuckSettings = { enabled: true, threshold: 0.03, duckedGain: 0.3, holdMs: 450 };

export interface DuckTarget {
  gain: number;
  /** AudioParam time constant (seconds): fast attack, slow recovery */
  timeConstant: number;
}

/** Decides the music gain from the microphone level; pure state machine driven by timestamps. */
export class DuckController {
  private holdUntil = 0;

  constructor(private settings: DuckSettings = DEFAULT_DUCKING) {}

  configure(partial: Partial<DuckSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  /**
   * @param micPeak   latest linear peak of the microphone
   * @param nowMs     monotonic clock in milliseconds
   * @param bypassed  when the studio is bypassed we do not duck
   */
  update(micPeak: number, nowMs: number, bypassed = false): DuckTarget {
    const s = this.settings;
    if (s.enabled && !bypassed && micPeak > s.threshold) this.holdUntil = nowMs + s.holdMs;
    const ducked = s.enabled && nowMs < this.holdUntil;
    return ducked ? { gain: s.duckedGain, timeConstant: 0.04 } : { gain: 1, timeConstant: 0.25 };
  }

  reset(): void {
    this.holdUntil = 0;
  }
}
