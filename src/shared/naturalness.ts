import type { StudioParams } from './params';

/**
 * How natural a voice setting is likely to sound.
 *
 * A real voice keeps its pitch and its vocal-tract size (formant) tied together: when a voice gets
 * higher the throat "gets smaller" by roughly 0.6 semitones per semitone of pitch. Every built-in
 * natural voice sits close to that diagonal. Moving far off it, or shifting a long way, is what
 * makes a changed voice sound artificial.
 */

/** formant semitones per pitch semitone on the natural diagonal */
export const NATURAL_RATIO = 0.62;

/** shifts up to this many semitones cost nothing */
const FREE_SHIFT = 5;

export type NaturalnessVerdict = 'natural' | 'noticeable' | 'robotic';

export interface Naturalness {
  /** 0..100 */
  score: number;
  verdict: NaturalnessVerdict;
  /** one short sentence the user can act on */
  advice: string;
  /** semitones the formant sits away from the natural diagonal (positive = too high) */
  offDiagonal: number;
}

type Input = Pick<StudioParams, 'voice'>;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

export function assessNaturalness({ voice }: Input): Naturalness {
  if (!voice.on || (voice.pitch === 0 && voice.formant === 0 && !voice.robot)) {
    return {
      score: 100,
      verdict: 'natural',
      advice: 'Your own voice, untouched.',
      offDiagonal: 0,
    };
  }

  const expected = voice.pitch * NATURAL_RATIO;
  const off = voice.formant - expected;
  const shift = Math.abs(voice.pitch);

  let score = 100;
  score -= Math.abs(off) * 7; // being off the diagonal is the biggest giveaway
  score -= Math.max(0, shift - FREE_SHIFT) * 5.5; // long shifts always sound processed
  if (voice.quality === 512) score -= 8; // the fast model is slightly synthetic
  if (voice.mix < 100 && voice.mix > 0) score -= (100 - voice.mix) * 0.08; // a mix of shifted and dry voice phases
  if (voice.robot) score = Math.min(score, 25);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: NaturalnessVerdict = score >= 80 ? 'natural' : score >= 50 ? 'noticeable' : 'robotic';

  return { score, verdict, advice: adviceFor(voice, off, shift, score), offDiagonal: round1(off) };
}

function adviceFor(voice: StudioParams['voice'], off: number, shift: number, score: number): string {
  if (voice.robot) return 'Robot voice is on – it is meant to sound artificial.';
  if (Math.abs(off) >= 1) {
    const target = round1(voice.pitch * NATURAL_RATIO);
    return off > 0
      ? `Formant is high for this pitch. Try ${signed(target)} st, or raise the pitch.`
      : `Formant is low for this pitch. Try ${signed(target)} st, or lower the pitch.`;
  }
  if (shift > 8) return 'A shift this large always sounds processed. Try a smaller pitch change.';
  if (shift > FREE_SHIFT + 1) return 'Natural enough, but a smaller shift would sound cleaner.';
  if (voice.quality === 512) return 'Switch to the Clean voice model for a smoother result.';
  return score >= 80 ? 'Pitch and formant agree. This should sound natural.' : 'Small changes sound best.';
}
