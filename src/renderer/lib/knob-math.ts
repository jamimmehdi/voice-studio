export interface KnobSpec {
  min: number;
  max: number;
  /** logarithmic scale (frequencies, times) */
  log?: boolean;
  step?: number;
  /** decimals to show; defaults depend on magnitude */
  dec?: number;
  unit?: string;
}

export const KNOB_START_DEG = -135;
export const KNOB_END_DEG = 135;

/** Value -> 0..1 position on the knob's travel. */
export function toNorm(spec: KnobSpec, value: number): number {
  const v = clampValue(spec, value);
  if (spec.log) return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
  return (v - spec.min) / (spec.max - spec.min);
}

/** 0..1 position -> value (unquantised). */
export function fromNorm(spec: KnobSpec, norm: number): number {
  const n = Math.min(1, Math.max(0, norm));
  if (spec.log) return spec.min * Math.pow(spec.max / spec.min, n);
  return spec.min + n * (spec.max - spec.min);
}

export function clampValue(spec: KnobSpec, value: number): number {
  return Math.min(spec.max, Math.max(spec.min, value));
}

/** Snap to `step` (if any) and clamp. */
export function quantize(spec: KnobSpec, value: number): number {
  const v = spec.step ? Math.round(value / spec.step) * spec.step : value;
  // avoid 0.30000000000000004 style artefacts
  return clampValue(spec, spec.step ? Number(v.toFixed(6)) : v);
}

/** A knob with a range that crosses zero draws its arc from the zero position. */
export function isBipolar(spec: KnobSpec): boolean {
  return !spec.log && spec.min < 0 && spec.max > 0;
}

export function angleFor(spec: KnobSpec, value: number): number {
  return KNOB_START_DEG + toNorm(spec, value) * (KNOB_END_DEG - KNOB_START_DEG);
}

/** Point on a circle; 0° points up, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG arc path between two angles. */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x0, y0] = polar(cx, cy, r, fromDeg);
  const [x1, y1] = polar(cx, cy, r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg >= fromDeg ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Text shown under the knob: "−3.0 dB", "1.10 kHz", "80 Hz", "100 %". */
export function formatKnobValue(spec: KnobSpec, value: number): string {
  const v = clampValue(spec, value);
  const unit = spec.unit ?? '';
  if (unit === ' Hz' && v >= 1000) return `${(v / 1000).toFixed(2)} kHz`;
  const decimals = spec.dec ?? (Math.abs(v) >= 100 ? 0 : 1);
  const text = v.toFixed(decimals);
  return `${text.replace('-', '−')}${unit}`;
}

/**
 * New knob value for a vertical drag: moving the pointer up by `range` px sweeps the whole travel.
 * Holding Shift uses a longer range for fine adjustment.
 */
export function dragValue(spec: KnobSpec, startValue: number, deltaYPixels: number, fine: boolean): number {
  const range = fine ? 900 : 180;
  return quantize(spec, fromNorm(spec, toNorm(spec, startValue) + deltaYPixels / range));
}

/** New knob value for one wheel notch (up = increase). */
export function wheelValue(spec: KnobSpec, value: number, deltaY: number, fine: boolean): number {
  const stepNorm = fine ? 0.005 : 0.02;
  return quantize(spec, fromNorm(spec, toNorm(spec, value) + (deltaY < 0 ? 1 : -1) * stepNorm));
}
