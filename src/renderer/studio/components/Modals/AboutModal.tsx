import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/ipc';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { useRuntime, useStudio } from '../../runtime/react';
import { ShortcutField } from './ShortcutField';
import styles from './modal.module.css';

const LINKS = {
  repo: 'https://github.com/jamimmehdi/voice-studio',
  releases: 'https://github.com/jamimmehdi/voice-studio/releases',
  vbcable: 'https://vb-audio.com/Cable/',
};

export function AboutModal(): React.ReactElement {
  const { api } = useRuntime();
  const setModal = useStudio((s) => s.setModal);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    void api.appInfo().then(setInfo);
  }, [api]);

  const open = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    void api.openExternal(url);
  };

  const check = async (): Promise<void> => {
    setUpdateMessage('Checking…');
    const result = await api.update.check();
    setUpdateMessage(result.ok ? 'Checked. An update (if any) appears in the top bar.' : result.error);
  };

  return (
    <Modal title="About Voice Studio" onClose={() => setModal(null)} centered>
      <h2 className={styles.heading}>
        Voice Studio <span className={styles.muted}>{info ? `v${info.version}` : ''}</span>
      </h2>
      <p>Real-time voice changer and vocal-processing studio for Windows.</p>
      <p className={styles.dev}>
        Designed &amp; developed by <b>Jamim Mehdi</b>
      </p>
      <div className={styles.buttons}>
        <Button onClick={() => setModal('guide')}>Setup guide</Button>
        <Button onClick={() => void check()}>Check for updates</Button>
        <Button onClick={() => void api.openExternal(LINKS.repo)}>GitHub</Button>
        <Button onClick={() => void api.openExternal(LINKS.releases)}>Releases</Button>
      </div>
      <div className={`${styles.muted} ${styles.small}`} role="status">
        {updateMessage}
      </div>

      <h3 className={styles.section}>Compact mode</h3>
      <ShortcutField />
      <div className={styles.buttons}>
        <Button onClick={() => void api.openCompact()}>Open compact panel</Button>
        <Button onClick={() => void api.quitApp()}>Quit Voice Studio</Button>
      </div>
      <p className={`${styles.muted} ${styles.small}`}>
        Closing or minimising the window keeps Voice Studio running in the system tray.
      </p>

      <h3 className={styles.section}>Credits</h3>
      <ul className={`${styles.list} ${styles.small}`}>
        <li>
          <b>VB-CABLE</b> virtual audio driver by Vincent Burel / VB-Audio (donationware) –{' '}
          <a href="#" onClick={open(LINKS.vbcable)}>
            vb-audio.com/Cable
          </a>
          . Not bundled; installed from the official source on request.
        </li>
        <li>
          <b>yt-dlp</b> – link audio extraction (downloaded on first use).
        </li>
        <li>
          <b>Plus Jakarta Sans</b> and <b>JetBrains Mono</b> – typefaces (SIL Open Font License).
        </li>
        <li>
          <b>Electron</b>, <b>React</b>, <b>electron-updater</b>.
        </li>
      </ul>
      <p className={`${styles.muted} ${styles.small}`}>© 2026 Jamim Mehdi. Released under the MIT licence.</p>
    </Modal>
  );
}
