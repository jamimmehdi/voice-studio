import { formatEngineStats } from '@shared/format';
import { useController, useEngineStats, useStudio } from '../../runtime/react';
import styles from './LivePill.module.css';

/** Start / stop button that also shows the live latency and dropout count. */
export function LivePill(): React.ReactElement {
  const engine = useStudio((s) => s.engine);
  const controller = useController();
  const stats = useEngineStats();
  const running = engine === 'running';

  const label = running ? 'LIVE' : engine === 'starting' ? 'Starting…' : 'Start engine';
  return (
    <button
      type="button"
      className={`${styles.pill} ${running ? styles.on : ''}`}
      title="Start / stop the audio engine"
      aria-pressed={running}
      disabled={engine === 'starting'}
      onClick={() => void controller.toggle()}
    >
      <span className={styles.dot} />
      <span>{label}</span>
      {running && (
        <span className={`${styles.stats} mono`}>{formatEngineStats(stats.latencyMs, stats.dropouts)}</span>
      )}
    </button>
  );
}
