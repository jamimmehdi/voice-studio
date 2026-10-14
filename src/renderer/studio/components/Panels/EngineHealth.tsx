import type { BufferMode } from '@shared/persisted-state';
import { Card } from '../../../ui/Card';
import { useController, useEngineStats, useStudio } from '../../runtime/react';
import styles from './EngineHealth.module.css';

const QUALITY_NAME: Record<number, string> = { 512: 'Fast', 1024: 'Balanced', 2048: 'Clean' };

/** Latency, dropouts, quality, sample rate and the audio buffer size. */
export function EngineHealth(): React.ReactElement {
  const { engine, quality, buffer } = useStudio((s) => ({
    engine: s.engine, quality: s.params.voice.quality, buffer: s.buffer,
  }));
  const controller = useController();
  const stats = useEngineStats();
  const running = engine === 'running';
  const dash = '–';

  return (
    <Card title="Engine health">
      <div className={styles.grid}>
        <div className={styles.box}>
          <div className={styles.key}>Latency</div>
          <div className={`${styles.value} mono`}>{running ? `${stats.latencyMs} ms` : dash}</div>
        </div>
        <div className={styles.box}>
          <div className={styles.key}>Dropouts</div>
          <div
            className={`${styles.value} mono ${running ? (stats.dropouts > 0 ? styles.bad : styles.ok) : ''}`}
            data-testid="dropouts"
          >
            {running ? stats.dropouts : dash}
          </div>
        </div>
        <div className={styles.box}>
          <div className={styles.key}>Voice quality</div>
          <div className={`${styles.value} mono`}>{QUALITY_NAME[quality] ?? quality}</div>
        </div>
        <div className={styles.box}>
          <div className={styles.key}>Sample rate</div>
          <div className={`${styles.value} mono`}>{running && stats.sampleRate ? `${(stats.sampleRate / 1000).toFixed(1)} kHz` : dash}</div>
        </div>
      </div>
      <div className={styles.buffer}>
        <label htmlFor="buffer-select">Audio buffer</label>
        <select
          id="buffer-select"
          value={buffer}
          onChange={(e) => void controller.setBuffer(e.target.value as BufferMode)}
          title="Raise it if you hear crackling"
        >
          <option value="low">Low latency</option>
          <option value="balanced">Balanced</option>
          <option value="safe">Safe</option>
        </select>
      </div>
    </Card>
  );
}
