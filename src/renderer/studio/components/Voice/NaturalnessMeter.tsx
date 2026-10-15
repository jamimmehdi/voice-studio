import { assessNaturalness, type NaturalnessVerdict } from '@shared/naturalness';
import type { StudioParams } from '@shared/params';
import styles from './NaturalnessMeter.module.css';

const VERDICT_LABEL: Record<NaturalnessVerdict, string> = {
  natural: 'Natural',
  noticeable: 'Noticeable',
  robotic: 'Robotic',
};

/** A 0-100 score for how natural the pitch / formant combination will sound, with one tip. */
export function NaturalnessMeter({ voice }: { voice: StudioParams['voice'] }): React.ReactElement {
  const n = assessNaturalness({ voice });
  return (
    <section className={`${styles.box} ${styles[n.verdict]}`} aria-label="Naturalness">
      <div className={styles.head}>
        <span className={styles.title}>Naturalness</span>
        <span className={`${styles.verdict} ${styles[n.verdict]}`}>{VERDICT_LABEL[n.verdict]}</span>
        <span className={`${styles.score} mono`} data-testid="naturalness-score">
          {n.score}
        </span>
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label="Naturalness score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={n.score}
      >
        <span
          className={`${styles.fill} ${n.verdict === 'natural' ? '' : styles[n.verdict]}`}
          style={{ width: `${n.score}%` }}
        />
      </div>
      <p className={styles.advice}>{n.advice}</p>
    </section>
  );
}
