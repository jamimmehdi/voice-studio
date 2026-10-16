import { useState } from 'react';
import { signed } from '@shared/format';
import { BarSlider } from '../../ui/BarSlider';
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
      <div onPointerUp={() => setLocal(null)} onBlur={() => setLocal(null)}>
        <BarSlider
          label={label}
          size="md"
          min={-12}
          max={12}
          step={0.1}
          value={shown}
          defaultValue={0}
          onChange={(v) => {
            setLocal(v);
            onChange(v);
          }}
        />
      </div>
    </div>
  );
}

export function TuneCard({ pitch, formant, onPitch, onFormant }: TuneCardProps): React.ReactElement {
  return (
    <section className={styles.card} aria-label="Fine tune">
      <TuneSlider label="Pitch" caption="Pitch · deeper ↔ higher" value={pitch} onChange={onPitch} />
      <TuneSlider
        label="Formant"
        caption="Formant · larger ↔ smaller throat"
        value={formant}
        onChange={onFormant}
      />
    </section>
  );
}
