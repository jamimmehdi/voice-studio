import { shortSigned } from '@shared/format';
import { BUILTIN_PRESETS, VOICE_TILES } from '@shared/presets';
import { Card } from '../../../ui/Card';
import { useStudio } from '../../runtime/react';
import styles from './VoicesCard.module.css';

/** Short "+4.5 / +2.8" caption of a preset's pitch and formant. */
export function presetCaption(presetKey: string): string {
  const voice = BUILTIN_PRESETS[presetKey]?.voice;
  if (!voice || voice.on === false || voice.pitch === undefined || voice.formant === undefined)
    return 'no change';
  const base = `${shortSigned(voice.pitch)} / ${shortSigned(voice.formant)}`;
  return voice.robot ? `${base} · ring` : base;
}

/** One-click voices (the built-in presets that change the voice). */
export function VoicesCard(): React.ReactElement {
  const { preset, applyPreset } = useStudio((s) => ({ preset: s.preset, applyPreset: s.applyPreset }));
  return (
    <Card title="Voices" padding="roomy">
      <div className={styles.grid}>
        {VOICE_TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={preset === tile.key}
            className={`${styles.tile} ${preset === tile.key ? styles.active : ''}`}
            onClick={() => applyPreset(tile.key)}
          >
            <span className={styles.top}>
              <span className={styles.dot} style={{ background: tile.color }} />
              <span className={styles.name}>{tile.label}</span>
            </span>
            <span className={`${styles.values} mono`}>{presetCaption(tile.key)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
