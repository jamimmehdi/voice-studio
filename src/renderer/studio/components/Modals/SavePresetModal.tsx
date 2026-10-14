import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { useStudio } from '../../runtime/react';
import styles from './modal.module.css';

/** Asks for a name and stores the current settings as a user preset (window.prompt does not exist in Electron). */
export function SavePresetModal(): React.ReactElement {
  const { preset, saveUserPreset, setModal, userPresets } = useStudio((s) => ({
    preset: s.preset, saveUserPreset: s.saveUserPreset, setModal: s.setModal, userPresets: s.userPresets,
  }));
  const [name, setName] = useState(preset && userPresets[preset] ? preset : 'My voice');
  const trimmed = name.trim();
  const exists = trimmed in userPresets;

  const save = (): void => {
    if (!trimmed) return;
    saveUserPreset(trimmed);
    setModal(null);
  };

  return (
    <Modal title="Save preset" onClose={() => setModal(null)}>
      <h2 className={styles.heading}>Save preset</h2>
      <p className={styles.muted}>Stores every setting of the studio so you can come back to this voice later.</p>
      <input
        className={styles.input}
        autoFocus
        aria-label="Preset name"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
      />
      {exists && <p className={`${styles.small} ${styles.warn}`}>A preset with this name exists and will be replaced.</p>}
      <div className={styles.buttons}>
        <Button variant="primary" disabled={!trimmed} onClick={save}>
          Save
        </Button>
        <Button onClick={() => setModal(null)}>Cancel</Button>
      </div>
    </Modal>
  );
}
