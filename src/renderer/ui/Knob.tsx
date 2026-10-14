import { useRef, useState } from 'react';
import {
  KNOB_END_DEG,
  KNOB_START_DEG,
  angleFor,
  arcPath,
  dragValue,
  formatKnobValue,
  isBipolar,
  polar,
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
}

const CX = 32;
const CY = 32;

/**
 * Rotary control: drag vertically (Shift = fine), scroll, arrow keys, double-click to reset.
 * Exposed as an ARIA slider.
 */
export function Knob(props: KnobProps): React.ReactElement {
  const { label, value, defaultValue, onChange, format, compact, ...spec } = props;
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const angle = angleFor(spec, value);
  const zero = isBipolar(spec) ? angleFor(spec, 0) : KNOB_START_DEG;
  const valuePath = Math.abs(angle - zero) < 0.5 ? '' : arcPath(CX, CY, 24, zero, angle);
  const [x0, y0] = polar(CX, CY, 9, angle);
  const [x1, y1] = polar(CX, CY, 20, angle);
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
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path className={styles.track} d={arcPath(CX, CY, 24, KNOB_START_DEG, KNOB_END_DEG)} />
        <path className={styles.val} d={valuePath} />
        <line className={styles.ind} x1={x0} y1={y0} x2={x1} y2={y1} />
      </svg>
      <div className={`${styles.value} mono`}>{text}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}

/** Position of a value as 0..1 (exported for tests / other widgets). */
export const knobNorm = toNorm;
