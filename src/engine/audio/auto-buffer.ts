import type { BufferMode } from '@shared/persisted-state';

const ORDER: readonly BufferMode[] = ['low', 'balanced', 'safe'];

/** The next safer buffer mode, or null when already at the safest. */
export function nextSaferBuffer(mode: BufferMode): BufferMode | null {
  const i = ORDER.indexOf(mode);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1]! : null;
}

export interface AutoBufferOptions {
  /** dropouts inside `windowMs` that trigger a change */
  threshold: number;
  windowMs: number;
  /** no second change this soon after the first */
  cooldownMs: number;
}

const DEFAULTS: AutoBufferOptions = { threshold: 3, windowMs: 20_000, cooldownMs: 45_000 };

export interface BufferChange {
  from: BufferMode;
  to: BufferMode;
  dropouts: number;
  at: number;
}

/**
 * Watches the dropout counter and decides when the audio buffer should be raised.
 * It only ever moves towards "safe"; lowering the buffer again is the user's choice.
 */
export class AutoBuffer {
  private readonly options: AutoBufferOptions;
  private samples: Array<{ t: number; total: number }> = [];
  private lastChange = -Infinity;

  constructor(options: Partial<AutoBufferOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Forget history (engine restarted: the counter starts from zero again). */
  reset(): void {
    this.samples = [];
  }

  /** Feed the cumulative dropout counter; returns a change when the buffer should go up. */
  observe(total: number, now: number, mode: BufferMode): BufferChange | null {
    const { windowMs, threshold, cooldownMs } = this.options;
    this.samples.push({ t: now, total });
    this.samples = this.samples.filter((s) => now - s.t <= windowMs);
    const oldest = this.samples[0];
    if (!oldest) return null;
    const recent = total - oldest.total;
    if (recent < threshold) return null;
    if (now - this.lastChange < cooldownMs) return null;

    const to = nextSaferBuffer(mode);
    if (!to) return null;
    this.lastChange = now;
    this.samples = [];
    return { from: mode, to, dropouts: recent, at: now };
  }
}
