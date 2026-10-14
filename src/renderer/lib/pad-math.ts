import { clamp } from '@shared/params';

export const PAD_RANGE = 12; // semitones either side of centre

export interface PercentPoint {
  /** 0..100, left -> right = lower -> higher pitch */
  x: number;
  /** 0..100, top -> bottom = larger -> smaller throat */
  y: number;
}

/** Pitch (x) and formant (y) in semitones -> position on the pad in percent. */
export function padPosition(pitch: number, formant: number): PercentPoint {
  return {
    x: ((clamp(pitch, -PAD_RANGE, PAD_RANGE) + PAD_RANGE) / (2 * PAD_RANGE)) * 100,
    y: ((PAD_RANGE - clamp(formant, -PAD_RANGE, PAD_RANGE)) / (2 * PAD_RANGE)) * 100,
  };
}

/** Slope of the "natural sounding" diagonal: formant follows pitch at about 62 %. */
export const NATURAL_FORMANT_RATIO = 0.62;

/**
 * Pointer position inside the pad (0..1 each) -> pitch / formant in semitones, rounded to 0.1.
 * With `snapToNatural` the formant is placed on the natural-voice diagonal.
 */
export function padValue(nx: number, ny: number, snapToNatural: boolean): { pitch: number; formant: number } {
  const x = clamp(nx, 0, 1);
  const y = clamp(ny, 0, 1);
  const round = (v: number): number => Math.round(v * 10) / 10;
  const pitch = round(x * 2 * PAD_RANGE - PAD_RANGE);
  const formant = snapToNatural ? round(pitch * NATURAL_FORMANT_RATIO) : round(PAD_RANGE - y * 2 * PAD_RANGE);
  return { pitch, formant };
}
