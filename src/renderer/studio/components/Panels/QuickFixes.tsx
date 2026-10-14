import type { ModuleKey } from '@shared/params';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { useStudio } from '../../runtime/react';
import styles from './QuickFixes.module.css';

interface Fix {
  id: string;
  title: string;
  sub: string;
  module?: ModuleKey;
}

const FIXES: readonly Fix[] = [
  { id: 'noise', title: 'Cut background noise', sub: 'Gate between words', module: 'exp' },
  { id: 'ess', title: 'Tame harsh S sounds', sub: 'De-esser', module: 'deess' },
  { id: 'volume', title: 'Even out my volume', sub: 'Compressor', module: 'comp' },
  { id: 'clip', title: 'Protect from clipping', sub: 'Limiter', module: 'lim' },
  { id: 'warm', title: 'Warmer tone', sub: 'Bass shelf +3 dB' },
];

/** One-tap switches for the most common clean-up jobs, in plain language. */
export function QuickFixes(): React.ReactElement {
  const { params, warm, toggleModule, setWarm } = useStudio((s) => ({
    params: s.params,
    warm: s.warm,
    toggleModule: s.toggleModule,
    setWarm: s.setWarm,
  }));

  return (
    <Card title="Quick fixes">
      <p className={styles.hint}>One-tap clean-up. Fine control lives in the chain above.</p>
      {FIXES.map((fix) => {
        const checked = fix.module ? params[fix.module].on : warm;
        return (
          <div className={styles.row} key={fix.id}>
            <div className={styles.text}>
              <b>{fix.title}</b>
              <span>{fix.sub}</span>
            </div>
            <Switch
              label={fix.title}
              checked={checked}
              onChange={(next) => (fix.module ? toggleModule(fix.module) : setWarm(next))}
            />
          </div>
        );
      })}
    </Card>
  );
}
