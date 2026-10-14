import { BrandMark } from './BrandMark';
import { LivePill } from './LivePill';
import { MusicSwitch } from './MusicSwitch';
import { PresetControls } from './PresetControls';
import { UpdateChip } from './UpdateChip';
import { BypassButton } from './BypassButton';
import { useStudio } from '../../runtime/react';
import { Button } from '../../../ui/Button';
import styles from './TopBar.module.css';

/**
 * Fixed top bar. It doubles as the window's title bar: the empty space is a drag handle and Windows
 * draws its (themed) minimise / maximise / close buttons over the reserved right edge.
 */
export function TopBar(): React.ReactElement {
  const setModal = useStudio((s) => s.setModal);
  return (
    <header className={styles.topbar}>
      <BrandMark />
      <LivePill />
      <div className={styles.spacer} />
      <PresetControls />
      <MusicSwitch />
      <BypassButton />
      <UpdateChip />
      <Button
        variant="ghost"
        icon
        aria-label="About Voice Studio"
        title="About Voice Studio"
        onClick={() => setModal('about')}
      >
        i
      </Button>
    </header>
  );
}
