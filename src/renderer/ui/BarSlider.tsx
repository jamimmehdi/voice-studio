import type { CSSProperties } from 'react';
import styles from './BarSlider.module.css';

export interface BarSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  label: string;
  /** track thickness in px (the design uses 4, 5 and 6) */
  height?: number;
  /** colour of the filled part */
  fill?: string;
  className?: string;
  /** reset target for double click */
  defaultValue?: number;
}

/** Flat bar slider (native range input underneath, so keyboard and screen readers just work). */
export function BarSlider({
  value, min, max, step = 1, onChange, label, height = 6, fill = 'var(--accent)', className, defaultValue,
}: BarSliderProps): React.ReactElement {
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const style = { '--p': `${percent}%`, '--h': `${height}px`, '--fill': fill } as CSSProperties;
  return (
    <input
      type="range"
      className={`${styles.slider} ${className ?? ''}`}
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
  );
}
