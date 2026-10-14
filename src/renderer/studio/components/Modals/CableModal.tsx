import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { useController, useRuntime, useStudio } from '../../runtime/react';
import styles from './modal.module.css';

/** Explains and starts the (user-initiated) download of the official VB-CABLE package. */
export function CableModal(): React.ReactElement {
  const setModal = useStudio((s) => s.setModal);
  const controller = useController();
  const { api } = useRuntime();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const go = async (): Promise<void> => {
    setBusy(true);
    setMessage({ ok: true, text: 'Downloading VB-CABLE from vb-audio.com…' });
    const result = await controller.installCable();
    setBusy(false);
    setMessage(
      result.ok
        ? { ok: true, text: 'VB-CABLE installer started. Click “Install Driver”, then restart your PC.' }
        : { ok: false, text: `Could not start the installer: ${result.error}` },
    );
  };

  return (
    <Modal title="Install the virtual microphone" onClose={() => setModal(null)}>
      <h2 className={styles.heading}>Install the virtual microphone</h2>
      <p>
        Games can only use real input devices, so Voice Studio needs a free <b>virtual audio cable</b>. This
        will download <b>VB-CABLE</b> from <i>vb-audio.com</i> (official source, about 1.3&nbsp;MB), check its
        digital signature and start VB-Audio&apos;s own installer. Windows will ask for administrator
        permission.
      </p>
      <ol className={styles.small}>
        <li>
          Click <b>Download &amp; start installer</b>.
        </li>
        <li>
          In the VB-CABLE window click <b>Install Driver</b>.
        </li>
        <li>
          <b>Restart your PC</b>, then open Voice Studio again.
        </li>
      </ol>
      <p className={`${styles.muted} ${styles.small}`}>
        VB-CABLE is donationware by VB-Audio (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            void api.openExternal('https://vb-audio.com/Cable/');
          }}
        >
          vb-audio.com/Cable
        </a>
        ) – please consider supporting them. It is a separate product with its own licence.
      </p>
      <div className={styles.buttons}>
        <Button variant="primary" disabled={busy} onClick={() => void go()}>
          Download &amp; start installer
        </Button>
        <Button onClick={() => setModal(null)}>Cancel</Button>
      </div>
      {message && (
        <div role="status" className={`${styles.small} ${message.ok ? styles.ok : styles.warn}`}>
          {message.text}
        </div>
      )}
    </Modal>
  );
}
