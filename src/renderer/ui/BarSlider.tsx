import type { CSSProperties } from 'react';
import styles from './BarSlider.module.css';

export type BarSliderSize = 'sm' | 'md' | 'lg' | 'touch';

export interface BarSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  label: string;
  /** cap size: `sm` for tight rows (music dock), `touch` is a slim cap with a tall grip for fingers */
  size?: BarSliderSize;
  className?: string;
  /** reset target for double click */
  defaultValue?: number;
  /** the lights glow while the thing the slider belongs to is switched on (default true) */
  lit?: boolean;
}

const TICKS: Record<BarSliderSize, number> = { sm: 13, md: 25, lg: 25, touch: 25 };

/**
 * A 3D fader: a recessed groove with a row of lights that glow up to a ridged cap, matching the
 * knobs. A real (invisible) `<input type="range">` sits on top, so pointer, touch, keyboard and
 * screen readers all work exactly like a native slider.
 */
export function BarSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  size = 'md',
  className,
  defaultValue,
  lit = true,
}: BarSliderProps): React.ReactElement {
  const norm = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const bipolar = min < 0 && max > 0;
  const zero = bipolar ? -min / (max - min) : 0;
  const lo = Math.min(zero, norm);
  const hi = Math.max(zero, norm);
  const count = TICKS[size];

  const style = {
    '--p': `${norm * 100}%`,
    '--pn': String(norm),
    '--lo': String(lo),
    '--hi': String(hi),
  } as CSSProperties;

  return (
    <div
      className={`${styles.fader} ${styles[size]} ${lit ? styles.lit : ''} ${className ?? ''}`}
      style={style}
    >
      <span className={styles.groove} aria-hidden="true" />
      <span className={styles.fill} aria-hidden="true" />
      <span className={styles.ticks} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => {
          const t = i / (count - 1);
          const on = t >= lo - 0.0001 && t <= hi + 0.0001;
          const long = i % 6 === 0;
          return <i key={i} className={`${on ? styles.on : ''} ${long ? styles.long : ''}`} />;
        })}
      </span>
      <span className={styles.cap} aria-hidden="true" />
      <input
        type="range"
        className={styles.input}
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => {
          if (defaultValue !== undefined) onChange(defaultValue);
        }}
      />
    </div>
  );
}
