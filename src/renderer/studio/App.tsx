import { ChainStrip } from './components/ChainStrip/ChainStrip';
import { CreditBar } from './components/CreditBar/CreditBar';
import { DevicesCard } from './components/Devices/DevicesCard';
import { LevelsCard } from './components/Levels/LevelsCard';
import { LiveOutput } from './components/LiveOutput/LiveOutput';
import { Modals } from './components/Modals/Modals';
import { MusicDock } from './components/Music/MusicDock';
import { EngineHealth } from './components/Panels/EngineHealth';
import { QuickFixes } from './components/Panels/QuickFixes';
import { StageEditor } from './components/Stages/StageEditor';
import { TopBar } from './components/TopBar/TopBar';
import { useStudio } from './runtime/react';
import styles from './App.module.css';

/** Layout of the studio window: fixed top bar, chain strip, three columns, floating music dock. */
export function App(): React.ReactElement {
  const showMusic = useStudio((s) => s.music.show);
  return (
    <div className={`${styles.app} ${showMusic ? styles.withMusic : ''}`}>
      <TopBar />
      <ChainStrip />
      <main className={styles.workspace}>
        <aside className={`${styles.col} ${styles.left}`}>
          <DevicesCard />
          <LevelsCard />
        </aside>
        <section className={`${styles.col} ${styles.center}`} aria-label="Stage editor">
          <StageEditor />
        </section>
        <aside className={`${styles.col} ${styles.right}`}>
          <LiveOutput />
          <QuickFixes />
          <EngineHealth />
        </aside>
      </main>
      <MusicDock />
      <CreditBar />
      <Modals />
    </div>
  );
}
