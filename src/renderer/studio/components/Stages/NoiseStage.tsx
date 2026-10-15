import { NOISE_LEVEL_AMOUNT, noiseLevelFor, type NoiseLevel } from '@shared/calibration';
import { STAGE_INFO } from '@shared/stages';
import { BarSlider } from '../../../ui/BarSlider';
import { useStudio } from '../../runtime/react';
import { StageCard } from './StageCard';
import { useNoiseFloor } from './use-noise-floor';
import styles from './NoiseStage.module.css';

const LEVELS: readonly NoiseLevel[] = ['Light', 'Medium', 'Strong'];

const db = (v: number): string => `${v.toFixed(0).replace('-', '−')} dB`;

/** Noise removal: three strengths, a fine amount slider and a live before / after reading. */
export function NoiseStage(): React.ReactElement {
  const { amount, on, running, patchModule } = useStudio((s) => ({
    amount: s.params.noise.amount,
    on: s.params.noise.on,
    running: s.engine === 'running',
    patchModule: s.patchModule,
  }));
  const floor = useNoiseFloor(running);
  const info = STAGE_INFO.noise;
  const current = noiseLevelFor(amount);
  const beforeWidth = floor ? Math.max(6, Math.min(100, ((floor.before + 80) / 80) * 100)) : 100;
  const afterWidth = floor ? Math.max(4, Math.min(100, ((floor.after + 80) / 80) * 100)) : 40;

  return (
    <StageCard title={info.title} description={info.description} module="noise">
      <div className={styles.body}>
        <div className={styles.levels} role="group" aria-label="Strength">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={current === level}
              className={`${styles.level} ${current === level ? styles.levelOn : ''}`}
              onClick={() => patchModule('noise', { amount: NOISE_LEVEL_AMOUNT[level] })}
            >
              {level}
            </button>
          ))}
        </div>

        <div>
          <div className={styles.sliderHead}>
            <span>Amount</span>
            <span className="mono">{Math.round(amount)}%</span>
          </div>
          <BarSlider
            label="Noise removal amount"
            min={0}
            max={100}
            step={1}
            value={amount}
            defaultValue={70}
            onChange={(v) => patchModule('noise', { amount: v })}
          />
        </div>

        <div className={styles.compare} aria-label="Noise floor before and after">
          <div className={styles.compareRow}>
            <span>Before</span>
            <span className="mono">{floor ? `${db(floor.before)} floor` : '–'}</span>
          </div>
          <div className={styles.beforeBar} style={{ width: `${beforeWidth}%` }} />
          <div className={`${styles.compareRow} ${styles.after}`}>
            <span>After</span>
            <span className="mono">{floor && on ? `${db(floor.after)} floor` : '–'}</span>
          </div>
          <div className={styles.afterBar} style={{ width: `${on ? afterWidth : 0}%` }} />
        </div>

        <div className={styles.foot}>Adds about 10 ms. Runs on your CPU, no cloud.</div>
      </div>
    </StageCard>
  );
}
