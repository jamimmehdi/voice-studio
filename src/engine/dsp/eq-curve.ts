import type { StudioParams } from '@shared/params';
import { biquadCoeffs, biquadMagnitudeDb } from './biquad';

/**
 * Combined magnitude response (dB) of the high-pass filter and the EQ bands at `freq`.
 * Pure function used by the live graph; mirrors what the worklet actually applies.
 */
export function eqCurveDb(
  params: Pick<StudioParams, 'hpf' | 'eq'>,
  freq: number,
  sampleRate: number,
): number {
  let db = 0;
  const { hpf, eq } = params;
  if (hpf.on) {
    if (hpf.slope === 24) {
      db += biquadMagnitudeDb(biquadCoeffs('highpass', sampleRate, hpf.freq, 0.5412), sampleRate, freq);
      db += biquadMagnitudeDb(biquadCoeffs('highpass', sampleRate, hpf.freq, 1.3066), sampleRate, freq);
    } else {
      db += biquadMagnitudeDb(biquadCoeffs('highpass', sampleRate, hpf.freq, 0.7071), sampleRate, freq);
    }
  }
  if (eq.on) {
    for (const b of eq.bands) {
      if (!b.on) continue;
      db += biquadMagnitudeDb(biquadCoeffs(b.type, sampleRate, b.freq, b.q, b.gain), sampleRate, freq);
    }
  }
  return db;
}
