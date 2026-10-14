import { useState } from 'react';
import { formatTime } from '@shared/format';
import { BarSlider } from '../../../ui/BarSlider';
import { Button } from '../../../ui/Button';
import { Switch } from '../../../ui/Switch';
import { useMusic, useRuntime, useStudio } from '../../runtime/react';
import { PlaylistPopover } from './PlaylistPopover';
import styles from './MusicDock.module.css';

/**
 * Floating music player. The music is mixed into your microphone output (it bypasses the voice effects)
 * and also plays in your headphones. It only renders while the header switch is on.
 */
export function MusicDock(): React.ReactElement | null {
  const { show, vol, duck, setMusic, engine } = useStudio((s) => ({
    show: s.music.show,
    vol: s.music.vol,
    duck: s.music.duck,
    setMusic: s.setMusic,
    engine: s.engine,
  }));
  const music = useMusic();
  const { player } = useRuntime();
  const [open, setOpen] = useState(false);
  if (!show) return null;

  const title = music.title || (music.hasElement ? 'Nothing loaded' : 'Start the engine to play');
  const canPlay = music.hasElement && music.trackCount > 0 && engine === 'running';

  return (
    <footer className={styles.dock} aria-label="Music player">
      <div className={styles.left}>
        <div className={styles.cover} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M9 18V6l10-2v12"
              stroke="#fff"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="7" cy="18" r="2.4" stroke="#fff" strokeWidth="2" fill="none" />
            <circle cx="17" cy="16" r="2.4" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div className={styles.info}>
          <div className={styles.title} title={title}>
            {title}
          </div>
          <div className={styles.sub}>Plays through your mic · teammates hear it</div>
        </div>
      </div>

      <div className={styles.transport}>
        <button
          type="button"
          className={styles.round}
          aria-label="Previous track"
          disabled={music.trackCount === 0}
          onClick={() => player.previous()}
        >
          ⏮
        </button>
        <button
          type="button"
          className={`${styles.round} ${styles.play}`}
          aria-label={music.playing ? 'Pause' : 'Play'}
          disabled={!canPlay}
          onClick={() => player.toggle()}
        >
          {music.playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className={styles.round}
          aria-label="Next track"
          disabled={music.trackCount === 0}
          onClick={() => player.next(false)}
        >
          ⏭
        </button>
        <span className={`${styles.time} mono`}>{formatTime(music.currentTime)}</span>
        <BarSlider
          className={styles.seek}
          label="Seek"
          value={Math.round(music.progress * 1000)}
          min={0}
          max={1000}
          onChange={(v) => player.seek(v / 1000)}
        />
        <span className={`${styles.time} mono`}>{formatTime(music.duration)}</span>
      </div>

      <div className={styles.right}>
        <label className={styles.volume}>
          Vol
          <BarSlider
            className={styles.volSlider}
            label="Music volume"
            value={vol}
            min={0}
            max={100}
            height={5}
            fill="var(--soft)"
            onChange={(v) => setMusic({ vol: v })}
          />
          <span className="mono">{Math.round(vol)}%</span>
        </label>
        <label className={styles.duck}>
          Duck when I talk
          <Switch size="sm" label="Duck when I talk" checked={duck} onChange={(v) => setMusic({ duck: v })} />
        </label>
        <button type="button" className={styles.add} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          + Add files / link
        </button>
        <RecordControl />
      </div>

      {open && <PlaylistPopover onClose={() => setOpen(false)} />}
    </footer>
  );
}

function RecordControl(): React.ReactElement {
  const { recording, engine } = useStudio((s) => ({ recording: s.recording, engine: s.engine }));
  const { controller } = useRuntime();
  return (
    <Button
      variant="record"
      disabled={engine !== 'running'}
      aria-pressed={recording}
      onClick={() => void controller.toggleRecording()}
    >
      {recording ? '■ Stop' : '● Rec'}
    </Button>
  );
}
