import type { QuickState } from '@shared/protocols';
import styles from './LiveCard.module.css';

interface LiveCardProps {
  state: Pick<QuickState, 'running' | 'preset' | 'stats' | 'level'>;
  onToggle(): void;
}

/** Big start / stop button with state, active voice, latency and a microphone meter. */
export function LiveCard({ state, onToggle }: LiveCardProps): React.ReactElement {
  return (
    <section className={styles.card}>
      <button
        type="button"
        className={`${styles.button} ${state.running ? styles.on : ''}`}
        aria-label={state.running ? 'Engine is live. Click to stop' : 'Engine is off. Click to start'}
        aria-pressed={state.running}
        onClick={onToggle}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v9M7 6.5a8 8 0 1 0 10 0" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <div className={styles.text}>
        <div className={`${styles.state} ${state.running ? styles.live : ''}`}>{state.running ? 'LIVE' : 'OFFLINE'}</div>
        <div className={styles.preset}>{state.preset ?? 'Custom voice'}</div>
        <div className={`${styles.stats} mono`}>{state.running ? state.stats : 'Click the button to start'}</div>
      </div>
      <div className={styles.meter}>
        <div className={styles.bar} role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={state.level}>
          <i style={{ height: `${Math.round(Math.max(0, Math.min(1, state.level)) * 100)}%` }} />
        </div>
        <span>MIC</span>
      </div>
    </section>
  );
}
