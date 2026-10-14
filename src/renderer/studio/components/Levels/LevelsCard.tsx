import { Card } from '../../../ui/Card';
import { GainReadout } from './GainReadout';
import { VerticalMeter } from './VerticalMeter';
import styles from './LevelsCard.module.css';

/** Input / output level meters with their gain readouts underneath. */
export function LevelsCard(): React.ReactElement {
  return (
    <Card title="Levels">
      <div className={styles.levels}>
        <div className={styles.channel}>
          <VerticalMeter channel="in" />
          <GainReadout which="inGain" label="Input gain" />
        </div>
        <div className={styles.channel}>
          <VerticalMeter channel="out" />
          <GainReadout which="outGain" label="Output gain" />
        </div>
      </div>
    </Card>
  );
}
