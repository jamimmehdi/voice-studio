import { useRef, useState } from 'react';
import { useWheel } from '../../../ui/use-wheel';
import { formatGain } from '@shared/format';
import { useStudio } from '../../runtime/react';
import styles from './GainReadout.module.css';

interface GainReadoutProps {
  which: 'inGain' | 'outGain';
  label: string;
}

const clampGain = (v: number): number => Math.max(-24, Math.min(24, v));

/** "0.0 dB" text that doubles as a control: drag up / down, wheel, arrow keys, double-click to reset. */
export function GainReadout({ which, label }: GainReadoutProps): React.ReactElement {
  const { value, setGain } = useStudio((s) => ({ value: s.params[which], setGain: s.setGain }));
  const drag = useRef<{ y: number; value: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  useWheel(
    root,
    (e) => {
      e.preventDefault();
      setGain(which, clampGain(value + (e.deltaY < 0 ? 0.5 : -0.5)));
    },
    focused,
  );

  return (
    <div
      ref={root}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={-24}
      aria-valuemax={24}
      aria-valuenow={value}
      aria-valuetext={formatGain(value)}
      title="Drag up/down to change, click then scroll for fine steps, double-click to reset"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`${styles.readout} mono`}
      onPointerDown={(e) => {
        drag.current = { y: e.clientY, value };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer released */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) setGain(which, clampGain(d.value + (d.y - e.clientY) / (e.shiftKey ? 20 : 4)));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => setGain(which, 0)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setGain(which, clampGain(value + 0.5));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setGain(which, clampGain(value - 0.5));
        }
      }}
    >
      {formatGain(value)}
    </div>
  );
}
