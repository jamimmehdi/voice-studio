import { useCallback, useRef } from 'react';
import { meterPercent, type DisplayMeters } from '@engine/audio/meter-smoother';
import { linToDb } from '@engine/dsp/math';
import { formatDb } from '@shared/format';
import { useMeterSubscription } from '../../runtime/react';
import styles from './VerticalMeter.module.css';

interface VerticalMeterProps {
  channel: 'in' | 'out';
}

/** Level meter with a peak-hold marker and a dB readout. Updates the DOM directly, not through React state. */
export function VerticalMeter({ channel }: VerticalMeterProps): React.ReactElement {
  const fill = useRef<HTMLElement>(null);
  const hold = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);

  const onMeters = useCallback(
    (m: DisplayMeters) => {
      const peak = channel === 'in' ? m.inPeak : m.outPeak;
      const holdDb = channel === 'in' ? m.inHoldDb : m.outHoldDb;
      const db = linToDb(peak);
      if (fill.current) fill.current.style.height = `${meterPercent(db)}%`;
      if (hold.current) hold.current.style.bottom = `calc(${meterPercent(holdDb)}% - 1px)`;
      if (text.current) text.current.textContent = peak > 0.0005 ? formatDb(db) : formatDb(-Infinity);
    },
    [channel],
  );
  useMeterSubscription(onMeters);

  return (
    <div className={styles.wrap}>
      <div ref={text} className={`${styles.db} mono`}>
        −∞
      </div>
      <div className={styles.meter} role="meter" aria-label={channel === 'in' ? 'Input level' : 'Output level'} aria-valuemin={-60} aria-valuemax={0}>
        <i ref={fill} className={styles.fill} />
        <b ref={hold} className={styles.hold} />
      </div>
      <div className={styles.label}>{channel === 'in' ? 'IN' : 'OUT'}</div>
    </div>
  );
}
