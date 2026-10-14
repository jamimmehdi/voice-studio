import { STAGE_INFO } from '@shared/stages';
import { Knob } from '../../../ui/Knob';
import { Switch } from '../../../ui/Switch';
import { useStudio } from '../../runtime/react';
import { StageCard } from './StageCard';
import styles from './EqStage.module.css';

const BAND_NAMES = ['LOW SHELF', 'BAND 2', 'BAND 3', 'BAND 4', 'BAND 5', 'HIGH SHELF'] as const;
const DEFAULT_FREQ = [120, 300, 1000, 3000, 6000, 10000] as const;

/** Six EQ bands. The same bands can be dragged in the Live output graph. */
export function EqStage(): React.ReactElement {
  const { bands, setEqBand } = useStudio((s) => ({ bands: s.params.eq.bands, setEqBand: s.setEqBand }));
  const info = STAGE_INFO.eq;

  return (
    <StageCard title={info.title} description={info.description} module="eq">
      <div className={styles.grid}>
        {bands.map((band, i) => (
          <div className={styles.band} key={BAND_NAMES[i]} data-band={i}>
            <div className={styles.bandHead}>
              <span>{BAND_NAMES[i]}</span>
              <Switch size="xs" label={`${BAND_NAMES[i]} on/off`} checked={band.on} onChange={(on) => setEqBand(i, { on })} />
            </div>
            <Knob compact label="FREQ" min={20} max={20000} log unit=" Hz" value={band.freq} defaultValue={DEFAULT_FREQ[i]!} onChange={(v) => setEqBand(i, { freq: v })} />
            <Knob compact label="GAIN" min={-18} max={18} step={0.1} unit=" dB" value={band.gain} defaultValue={0} onChange={(v) => setEqBand(i, { gain: v })} />
            <Knob compact label="Q" min={0.3} max={8} log unit="" dec={2} value={band.q} defaultValue={i === 0 || i === 5 ? 0.7 : 1} onChange={(v) => setEqBand(i, { q: v })} />
          </div>
        ))}
      </div>
    </StageCard>
  );
}
