import type { QuickChip } from '@shared/protocols';
import styles from './VoiceChips.module.css';

interface VoiceChipsProps {
  chips: readonly QuickChip[];
  active: string | null;
  onPick(presetKey: string): void;
}

export function VoiceChips({ chips, active, onPick }: VoiceChipsProps): React.ReactElement {
  return (
    <section aria-label="Voice">
      <div className={styles.eyebrow}>Voice</div>
      <div className={styles.chips}>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={chip.key === active}
            className={`${styles.chip} ${chip.key === active ? styles.on : ''}`}
            onClick={() => onPick(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}
