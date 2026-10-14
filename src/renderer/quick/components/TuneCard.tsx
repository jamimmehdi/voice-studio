import { useState } from 'react';
import { signed } from '@shared/format';
import styles from './TuneCard.module.css';

interface TuneCardProps {
  pitch: number;
  formant: number;
  onPitch(value: number): void;
  onFormant(value: number): void;
}

interface SliderProps {
  label: string;
  caption: string;
  value: number;
  onChange(value: number): void;
}

function TuneSlider({ label, caption, value, onChange }: SliderProps): React.ReactElement {
  // while the pointer is down the slider follows the user, not the (slightly delayed) engine state
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  return (
    <div>
      <div className={styles.row}>
        <span>{caption}</span>
        <span className="mono">{signed(shown)} st</span>
      </div>
      <input
        type="range"
        className={styles.slider}
        aria-label={label}
        min={-12}
        max={12}
        step={0.1}
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          onChange(v);
        }}
        onPointerUp={() => setLocal(null)}
        onBlur={() => setLocal(null)}
        onDoubleClick={() => {
          setLocal(null);
          onChange(0);
        }}
      />
    </div>
  );
}

export function TuneCard({ pitch, formant, onPitch, onFormant }: TuneCardProps): React.ReactElement {
  return (
    <section className={styles.card} aria-label="Fine tune">
      <TuneSlider label="Pitch" caption="Pitch · deeper ↔ higher" value={pitch} onChange={onPitch} />
      <TuneSlider label="Formant" caption="Formant · larger ↔ smaller throat" value={formant} onChange={onFormant} />
    </section>
  );
}
