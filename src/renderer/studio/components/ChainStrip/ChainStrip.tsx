import { STAGES } from '@shared/stages';
import { ChainNode } from './ChainNode';
import styles from './ChainStrip.module.css';

const Chevron = (): React.ReactElement => (
  <span className={styles.chevron} aria-hidden="true">
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path
        d="M3 2l5 4-5 4"
        stroke="#3b475c"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

/** The signal chain, left to right. Click a stage to edit it; each processing stage has its own switch. */
export function ChainStrip(): React.ReactElement {
  return (
    <section className={styles.wrap} aria-label="Signal chain">
      <div className={styles.head}>
        <div className={styles.eyebrow}>Signal chain</div>
        <div className={styles.sub}>Your voice flows left → right. Click a stage to edit it.</div>
      </div>
      <div className={styles.strip}>
        {STAGES.map((stage, i) => (
          <div className={styles.cell} key={stage.id}>
            <ChainNode stage={stage} />
            {i < STAGES.length - 1 && <Chevron />}
          </div>
        ))}
      </div>
    </section>
  );
}
