import type { Quality } from '@shared/params';
import type { BufferMode } from '@shared/persisted-state';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { useController, useEngineStats, useStudio } from '../../runtime/react';
import styles from './EngineHealth.module.css';

const QUALITY_NAME: Record<number, string> = { 512: 'Fast', 1024: 'Balanced', 2048: 'Clean', 4096: 'Studio' };

interface ModelOption {
  quality: Quality;
  title: string;
  sub: string;
}

const MODELS: readonly ModelOption[] = [
  { quality: 512, title: 'Fast', sub: 'Lowest delay, slightly synthetic' },
  { quality: 2048, title: 'Clean', sub: 'Natural and balanced' },
  { quality: 4096, title: 'Studio', sub: 'Best quality. For chat and streaming.' },
];

const BUFFER_NAME: Record<BufferMode, string> = { low: 'Low latency', balanced: 'Balanced', safe: 'Safe' };

/** "just now", "2 min ago" */
export function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

/** Voice model, automatic buffer, latency, dropouts and sample rate. */
export function EngineHealth(): React.ReactElement {
  const { engine, quality, buffer, autoBuffer, bufferChange, patchVoice, setAutoBuffer } = useStudio((s) => ({
    engine: s.engine,
    quality: s.params.voice.quality,
    buffer: s.buffer,
    autoBuffer: s.autoBuffer,
    bufferChange: s.bufferChange,
    patchVoice: s.patchVoice,
    setAutoBuffer: s.setAutoBuffer,
  }));
  const controller = useController();
  const stats = useEngineStats();
  const running = engine === 'running';
  const dash = '–';
  const msFor = (q: Quality): number => Math.round((q / (stats.sampleRate || 48000)) * 1000);

  return (
    <Card title="Engine">
      <div className={styles.model}>
        <div className={styles.modelHead}>Voice model</div>
        <div className={styles.models} role="group" aria-label="Voice model">
          {MODELS.map((m) => {
            const selected = quality === m.quality;
            return (
              <button
                key={m.quality}
                type="button"
                aria-pressed={selected}
                className={`${styles.modelBtn} ${selected ? styles.modelOn : ''}`}
                onClick={() => patchVoice({ quality: m.quality }, { custom: false })}
              >
                <span className={styles.modelTitle}>
                  {m.title} <span className={`${styles.modelMs} mono`}>· {msFor(m.quality)} ms</span>
                </span>
                <span className={styles.modelSub}>{m.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.autoRow}>
        <div className={styles.autoText}>
          <b>Auto buffer</b>
          <span>Raises the buffer by itself if audio starts to drop out.</span>
        </div>
        <Switch label="Auto buffer" checked={autoBuffer} onChange={setAutoBuffer} />
      </div>

      <div className={styles.bufferNote} role="status">
        Buffer is now <b className="mono">{BUFFER_NAME[buffer]}</b>.
        {bufferChange
          ? ` Last change: ${timeAgo(bufferChange.at, Date.now())} after ${bufferChange.dropouts} dropouts.`
          : ' No changes needed so far.'}
      </div>

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
          <div className={`${styles.value} mono`}>
            {running && stats.sampleRate ? `${(stats.sampleRate / 1000).toFixed(1)} kHz` : dash}
          </div>
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
