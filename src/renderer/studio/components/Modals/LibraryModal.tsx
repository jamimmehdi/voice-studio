import { Modal } from '../../../ui/Modal';
import { useStudio } from '../../runtime/react';
import { AbTest } from '../Library/AbTest';
import { FindMyVoice } from '../Library/FindMyVoice';
import { VoiceLibrary } from '../Library/VoiceLibrary';
import styles from './LibraryModal.module.css';

/** Voice library on the left; A/B test and "Find my voice" on the right. */
export function LibraryModal(): React.ReactElement {
  const setModal = useStudio((s) => s.setModal);
  return (
    <Modal title="Voice library" onClose={() => setModal(null)} width={1120} tone="page">
      <div className={styles.layout}>
        <VoiceLibrary />
        <div className={styles.side}>
          <AbTest />
          <FindMyVoice />
        </div>
      </div>
    </Modal>
  );
}
