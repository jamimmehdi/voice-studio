import { linToDb } from '../dsp/math';
import type { MeterSnapshot } from '@shared/protocols';

export interface DisplayMeters {
  /** smoothed linear peaks */
  inPeak: number;
  outPeak: number;
  /** smoothed gain reduction (dB, <= 0) */
  exp: number;
  deess: number;
  comp: number;
  lim: number;
  /** peak-hold markers in dB */
  inHoldDb: number;
  outHoldDb: number;
}

export const METER_FLOOR_DB = -60;

/** dB -> 0..100 percent of a meter spanning −60..0 dB. */
export const meterPercent = (db: number): number => Math.max(0, Math.min(100, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));

const PEAK_FALL = 0.9; // per update
const GR_FALL = 0.9;
const HOLD_MS = 1200;

/**
 * Turns the raw per-block peaks coming from the worklet into the smooth values a meter should show:
 * instant attack, exponential fall, plus peak-hold markers.
 */
export class MeterSmoother {
  private display: DisplayMeters = {
    inPeak: 0, outPeak: 0, exp: 0, deess: 0, comp: 0, lim: 0, inHoldDb: METER_FLOOR_DB, outHoldDb: METER_FLOOR_DB,
  };
  private holdInAt = 0;
  private holdOutAt = 0;

  /** @param raw latest snapshot or null when the engine is stopped */
  update(raw: MeterSnapshot | null, nowMs: number): DisplayMeters {
    const d = this.display;
    if (raw) {
      d.inPeak = Math.max(raw.inPeak, d.inPeak * PEAK_FALL);
      d.outPeak = Math.max(raw.outPeak, d.outPeak * PEAK_FALL);
      d.exp = Math.min(raw.exp, d.exp * GR_FALL);
      d.deess = Math.min(raw.deess, d.deess * GR_FALL);
      d.comp = Math.min(raw.comp, d.comp * GR_FALL);
      d.lim = Math.min(raw.lim, d.lim * GR_FALL);
    } else {
      d.inPeak *= PEAK_FALL;
      d.outPeak *= PEAK_FALL;
      d.exp *= GR_FALL;
      d.deess *= GR_FALL;
      d.comp *= GR_FALL;
      d.lim *= GR_FALL;
    }
    const inDb = linToDb(d.inPeak);
    const outDb = linToDb(d.outPeak);
    if (inDb > d.inHoldDb || nowMs - this.holdInAt > HOLD_MS) {
      d.inHoldDb = inDb;
      this.holdInAt = nowMs;
    }
    if (outDb > d.outHoldDb || nowMs - this.holdOutAt > HOLD_MS) {
      d.outHoldDb = outDb;
      this.holdOutAt = nowMs;
    }
    return { ...d };
  }
}
