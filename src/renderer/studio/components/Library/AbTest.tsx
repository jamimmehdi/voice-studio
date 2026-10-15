import { useEffect, useRef, useState } from 'react';
import { playClip, type ClipHandle } from '@engine/audio/clip-player';
import { useController, useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import { peakEnvelope, useCapture, type CaptureResult } from './use-capture';
import styles from './AbTest.module.css';

const SECONDS = 10;
const BARS = 64;

type Side = 'A' | 'B';

/** Records 10 seconds, then plays the raw microphone (A) and the processed voice (B) in your headphones. */
export function AbTest(): React.ReactElement {
  const controller = useController();
  const { running, monitorDevice } = useStudio((s) => ({
    running: s.engine === 'running',
    monitorDevice: s.dev.mon,
  }));
  const [clip, setClip] = useState<CaptureResult | null>(null);
  const [playing, setPlaying] = useState<Side | null>(null);
  const handle = useRef<ClipHandle | null>(null);
  const capture = useCapture((result) => setClip(result));

  useEffect(() => () => handle.current?.stop(), []);

  const play = async (side: Side): Promise<void> => {
    if (!clip) return;
    handle.current?.stop();
    setPlaying(side);
    try {
      const h = await playClip(side === 'A' ? clip.raw : clip.processed, clip.sampleRate, monitorDevice);
      handle.current = h;
      await h.done;
    } finally {
      setPlaying((cur) => (cur === side ? null : cur));
    }
  };

  const recording = capture.phase === 'recording';
  const rawBars = clip ? peakEnvelope(clip.raw, BARS) : null;
  const procBars = clip ? peakEnvelope(clip.processed, BARS) : null;

  return (
    <section className={features.card} aria-label="Hear how you sound">
      <h3 className={features.eyebrow}>Hear how you sound</h3>
      <div className={styles.recordRow}>
        <button
          type="button"
          className={`${styles.rec} ${recording ? styles.recOn : ''}`}
          aria-label={recording ? 'Stop recording' : 'Record 10 seconds'}
          disabled={!running || (controller.capturing && !recording)}
          onClick={() => (recording ? capture.cancel() : capture.start(SECONDS))}
        >
          <span />
        </button>
        <div className={features.grow}>
          <div className={styles.recTitle}>
            {recording ? `Recording… ${capture.remaining} s` : 'Record 10 seconds'}
          </div>
          <div className={`${features.small} ${features.muted}`}>
            {running
              ? 'Then compare your raw voice with the processed one.'
              : 'Start the engine first, then record.'}
          </div>
        </div>
      </div>

      <div className={styles.waves}>
        <div className={styles.waveRow}>
          <span className={styles.waveLabel}>Original</span>
          <div className={styles.bars} aria-hidden="true">
            {(rawBars ?? new Array<number>(BARS).fill(0.08)).map((v, i) => (
              <i key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />
            ))}
          </div>
        </div>
        <div className={styles.waveRow}>
          <span className={`${styles.waveLabel} ${styles.processed}`}>Processed</span>
          <div className={`${styles.bars} ${styles.barsOn}`} aria-hidden="true">
            {(procBars ?? new Array<number>(BARS).fill(0.08)).map((v, i) => (
              <i key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.play}>
        <button
          type="button"
          className={features.btn}
          disabled={!clip}
          aria-pressed={playing === 'A'}
          onClick={() => void play('A')}
        >
          {playing === 'A' ? 'Playing A…' : 'Play A · original'}
        </button>
        <button
          type="button"
          className={`${features.btn} ${features.btnPrimary}`}
          disabled={!clip}
          aria-pressed={playing === 'B'}
          onClick={() => void play('B')}
        >
          {playing === 'B' ? 'Playing B…' : 'Play B · processed'}
        </button>
      </div>
    </section>
  );
}
