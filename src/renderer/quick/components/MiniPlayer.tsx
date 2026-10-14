import type { QuickState } from '@shared/protocols';
import styles from './MiniPlayer.module.css';

interface MiniPlayerProps {
  music: QuickState['music'];
  /** playback needs the engine (the audio element lives in its graph) */
  enabled: boolean;
  onToggle(): void;
}

export function MiniPlayer({ music, enabled, onToggle }: MiniPlayerProps): React.ReactElement {
  return (
    <section className={styles.card} aria-label="Music">
      <div className={styles.row}>
        <div className={styles.cover} aria-hidden="true" />
        <div className={styles.info}>
          <div className={styles.title}>{music.title || 'No music loaded'}</div>
          <div className={styles.sub}>Teammates hear this · ducks when you talk</div>
        </div>
        <button
          type="button"
          className={styles.play}
          aria-label={music.playing ? 'Pause' : 'Play'}
          disabled={!music.has || !enabled}
          onClick={onToggle}
        >
          {music.playing ? '❚❚' : '▶'}
        </button>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(music.progress * 100)}
      >
        <i style={{ width: `${Math.round(music.progress * 100)}%` }} />
      </div>
    </section>
  );
}
