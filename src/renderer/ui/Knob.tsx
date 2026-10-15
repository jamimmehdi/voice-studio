import { useId, useRef, useState } from 'react';
import {
  KNOB_END_DEG,
  KNOB_START_DEG,
  angleFor,
  dragValue,
  formatKnobValue,
  isBipolar,
  quantize,
  toNorm,
  wheelValue,
  type KnobSpec,
} from '../lib/knob-math';
import styles from './Knob.module.css';
import { useWheel } from './use-wheel';

export interface KnobProps extends KnobSpec {
  label: string;
  value: number;
  /** value restored by a double click */
  defaultValue: number;
  onChange(value: number): void;
  /** override the displayed text */
  format?: (value: number) => string;
  /** compact variant used inside EQ bands */
  compact?: boolean;
  /** the light ring glows while the knob's module is switched on (default true) */
  lit?: boolean;
}

/** 3D geometry, in the 100 x 96 viewBox of the knob, seen from above and in front */
const CX = 50;
/**
 * Camera elevation above the table, in degrees: 0 = edge-on, 90 = looking straight down.
 * This is the one number that sets how much the knob faces the user.
 */
export const CAMERA_ELEVATION_DEG = 53;
/** how round the circles look at that elevation (the sine of the angle) */
const FLAT = Math.sin((CAMERA_ELEVATION_DEG * Math.PI) / 180);
const BASE_Y = 48;
const TOP_Y = 34;
const BODY_RX = 17;
const TICKS = 21;
const TICK_STEP = (KNOB_END_DEG - KNOB_START_DEG) / (TICKS - 1);

/** Point on a flattened circle (the knob is seen from slightly above), 0 deg = straight back. */
function onEllipse(cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + rx * Math.sin(a), cy - ry * Math.cos(a)];
}

const TICK_ANGLES = Array.from({ length: TICKS }, (_, i) => KNOB_START_DEG + i * TICK_STEP);
const RIDGES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

/**
 * Rotary control: drag vertically (Shift = fine), scroll, arrow keys, double-click to reset.
 * Exposed as an ARIA slider.
 */
export function Knob(props: KnobProps): React.ReactElement {
  const { label, value, defaultValue, onChange, format, compact, lit = true, ...spec } = props;
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '');
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const angle = angleFor(spec, value);
  const zero = isBipolar(spec) ? angleFor(spec, 0) : KNOB_START_DEG;
  const lo = Math.min(zero, angle) - 0.5;
  const hi = Math.max(zero, angle) + 0.5;
  const [x0, y0] = onEllipse(CX, TOP_Y, BODY_RX * 0.2, BODY_RX * 0.2 * FLAT, angle);
  const [x1, y1] = onEllipse(CX, TOP_Y, BODY_RX * 0.82, BODY_RX * 0.82 * FLAT, angle);
  const text = format ? format(value) : formatKnobValue(spec, value);

  const commit = (next: number): void => {
    const q = quantize(spec, next);
    if (q !== value) onChange(q);
  };

  useWheel(root, (e) => {
    e.preventDefault();
    commit(wheelValue(spec, value, e.deltaY, e.shiftKey));
  });

  return (
    <div
      ref={root}
      className={`${styles.knob} ${compact ? styles.compact : ''} ${dragging ? styles.dragging : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={text}
      onPointerDown={(e) => {
        drag.current = { startY: e.clientY, startValue: value };
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) commit(dragValue(spec, d.startValue, d.startY - e.clientY, e.shiftKey));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => commit(defaultValue)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          commit(wheelValue(spec, value, -1, e.shiftKey));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          commit(wheelValue(spec, value, 1, e.shiftKey));
        } else if (e.key === 'Home') {
          e.preventDefault();
          commit(spec.min);
        } else if (e.key === 'End') {
          e.preventDefault();
          commit(spec.max);
        }
      }}
    >
      <svg viewBox="0 0 100 96" aria-hidden="true" className={lit ? styles.lit : ''}>
        <defs>
          <linearGradient id={`${ids}s`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#0f141d" />
            <stop offset="0.28" stopColor="#3b475f" />
            <stop offset="0.5" stopColor="#2a3447" />
            <stop offset="1" stopColor="#0c1018" />
          </linearGradient>
          <radialGradient id={`${ids}t`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#56637e" />
            <stop offset="0.6" stopColor="#323d54" />
            <stop offset="1" stopColor="#1e2535" />
          </radialGradient>
          <linearGradient id={`${ids}b`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#0b0f16" />
            <stop offset="0.5" stopColor="#202838" />
            <stop offset="1" stopColor="#080b11" />
          </linearGradient>
        </defs>
        <ellipse cx={CX} cy={BASE_Y + 12} rx="42" ry="12" fill="#000" opacity="0.35" />
        <path
          d={`M${CX - 36},${BASE_Y} a36,${36 * FLAT} 0 0 0 72,0 v6 a36,${36 * FLAT} 0 0 1 -72,0 z`}
          fill={`url(#${ids}b)`}
        />
        <ellipse cx={CX} cy={BASE_Y} rx="36" ry={36 * FLAT} className={styles.plate} />
        {TICK_ANGLES.map((deg, i) => {
          const [ax, ay] = onEllipse(CX, BASE_Y, 27, 27 * FLAT, deg);
          const [bx, by] = onEllipse(CX, BASE_Y, 33, 33 * FLAT, deg);
          const on = deg >= lo && deg <= hi;
          return (
            <line
              key={i}
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              className={`${styles.tick} ${on ? styles.tickOn : ''}`}
            />
          );
        })}
        <path
          d={`M${CX - BODY_RX},${BASE_Y - 3} L${CX - BODY_RX},${TOP_Y} a${BODY_RX},${BODY_RX * FLAT} 0 0 0 ${BODY_RX * 2},0 L${CX + BODY_RX},${BASE_Y - 3} a${BODY_RX},${BODY_RX * FLAT} 0 0 1 ${-BODY_RX * 2},0 z`}
          fill={`url(#${ids}s)`}
        />
        {RIDGES.map((r) => (
          <line
            key={r}
            x1={CX + r * (BODY_RX / 4.6)}
            y1={BASE_Y - 3 + BODY_RX * FLAT * 0.8}
            x2={CX + r * (BODY_RX / 4.6)}
            y2={TOP_Y + BODY_RX * FLAT * 0.8}
            className={styles.ridge}
          />
        ))}
        <ellipse
          cx={CX}
          cy={TOP_Y}
          rx={BODY_RX}
          ry={BODY_RX * FLAT}
          fill={`url(#${ids}t)`}
          className={styles.top}
        />
        <line className={styles.ind} x1={x0} y1={y0} x2={x1} y2={y1} />
      </svg>
      <div className={`${styles.value} mono`}>{text}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}

/** Position of a value as 0..1 (exported for tests / other widgets). */
export const knobNorm = toNorm;
