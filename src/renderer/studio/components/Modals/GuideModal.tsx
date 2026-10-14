import { Modal } from '../../../ui/Modal';
import { useStudio } from '../../runtime/react';
import styles from './modal.module.css';

export function GuideModal(): React.ReactElement {
  const setModal = useStudio((s) => s.setModal);
  return (
    <Modal title="Using Voice Studio in a game" onClose={() => setModal(null)}>
      <h2 className={styles.heading}>Using Voice Studio in a game</h2>
      <ol>
        <li>
          Install a <b>virtual audio cable</b>. Windows cannot create a virtual microphone without a driver. If none is
          found, use the <b>Install virtual microphone (VB-CABLE)</b> button in the Devices panel, then reboot.
        </li>
        <li>
          Choose your real <b>Microphone</b> and set <b>Send to game / chat</b> to{' '}
          <code>CABLE Input (VB-Audio Virtual Cable)</code>.
        </li>
        <li>
          Click the <b>LIVE</b> button, pick a voice and talk.
        </li>
        <li>
          In the game / Discord / OBS select <code>CABLE Output (VB-Audio Virtual Cable)</code> as the{' '}
          <b>input device</b>.
        </li>
        <li>
          Turn on <b>Hear myself</b> to monitor in your headphones (use headphones to avoid feedback).
        </li>
      </ol>
      <p className={styles.muted}>
        Tip: the Voice stage has a quality setting – lower is faster, higher sounds smoother. Disable “Windows noise
        suppression / auto-gain” (Mic stage) unless you want them.
      </p>
    </Modal>
  );
}
