import { useRef } from 'react';
import { PAD_LANDMARKS } from '@shared/presets';
import { padPosition, padValue } from '../../../lib/pad-math';
import styles from './VoicePad.module.css';

export interface VoicePadProps {
  pitch: number;
  formant: number;
  /** called continuously while the pointer is down */
  onChange(pitch: number, formant: number): void;
  onReset(): void;
}

/**
 * Two-dimensional voice control: horizontal = pitch, vertical = formant (throat size).
 * Shift snaps the formant to the "natural voice" diagonal. Arrow keys nudge; Home resets.
 */
export function VoicePad({ pitch, formant, onChange, onReset }: VoicePadProps): React.ReactElement {
  const pad = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const puck = padPosition(pitch, formant);

  const fromPointer = (e: React.PointerEvent): void => {
    const rect = pad.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const v = padValue((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, e.shiftKey);
    onChange(v.pitch, v.formant);
  };

  return (
    <div
      ref={pad}
      className={styles.pad}
      role="application"
      aria-label={`Voice pad: pitch ${pitch.toFixed(1)} semitones, formant ${formant.toFixed(1)} semitones. Drag, or use the arrow keys.`}
      tabIndex={0}
      data-testid="voice-pad"
      onPointerDown={(e) => {
        dragging.current = true;
        fromPointer(e);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer released */
        }
      }}
      onPointerMove={(e) => {
        if (dragging.current) fromPointer(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.5;
        const clamp = (v: number): number => Math.max(-12, Math.min(12, Math.round(v * 10) / 10));
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(pitch + step), formant); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(pitch - step), formant); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(pitch, clamp(formant + step)); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(pitch, clamp(formant - step)); }
        else if (e.key === 'Home') { e.preventDefault(); onReset(); }
      }}
    >
      <svg className={styles.grid} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="100" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="25" y1="0" x2="25" y2="100" className={styles.fine} />
        <line x1="75" y1="0" x2="75" y2="100" className={styles.fine} />
        <line x1="0" y1="25" x2="100" y2="25" className={styles.fine} />
        <line x1="0" y1="75" x2="100" y2="75" className={styles.fine} />
        <polygon className={styles.zone} points="0,100 0,88 88,0 100,0 100,12 12,100" />
      </svg>
      <span className={`${styles.label} ${styles.bl}`}>← Deeper pitch</span>
      <span className={`${styles.label} ${styles.br}`}>Higher pitch →</span>
      <span className={`${styles.label} ${styles.tl}`}>↑ Smaller throat</span>
      <span className={`${styles.label} ${styles.bc}`}>natural-sounding zone follows the diagonal</span>

      {PAD_LANDMARKS.map((m) => {
        const p = padPosition(m.pitch, m.formant);
        return (
          <div key={m.label} className={styles.mark} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <i />
            <span>{m.label}</span>
          </div>
        );
      })}

      <div className={styles.puck} style={{ left: `${puck.x}%`, top: `${puck.y}%` }} data-testid="voice-puck">
        <i />
      </div>
    </div>
  );
}
