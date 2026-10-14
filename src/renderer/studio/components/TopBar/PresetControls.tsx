import { BUILTIN_PRESET_NAMES } from '@shared/presets';
import { Button } from '../../../ui/Button';
import { useStudio } from '../../runtime/react';
import styles from './PresetControls.module.css';

const CUSTOM = '';

/** Preset picker plus Save / Delete. Shows "Custom (unsaved)" as soon as a control was touched. */
export function PresetControls(): React.ReactElement {
  const { preset, userPresets, applyPreset, deleteUserPreset, setModal } = useStudio((s) => ({
    preset: s.preset,
    userPresets: s.userPresets,
    applyPreset: s.applyPreset,
    deleteUserPreset: s.deleteUserPreset,
    setModal: s.setModal,
  }));

  const userNames = Object.keys(userPresets);
  const isKnown = preset !== null && (BUILTIN_PRESET_NAMES.includes(preset) || userNames.includes(preset));
  const isUser = preset !== null && userNames.includes(preset);

  return (
    <>
      <label className={styles.label}>
        Preset
        <select
          className={styles.select}
          value={isKnown ? preset : CUSTOM}
          onChange={(e) => {
            if (e.target.value !== CUSTOM) applyPreset(e.target.value);
          }}
        >
          {!isKnown && <option value={CUSTOM}>Custom (unsaved)</option>}
          <optgroup label="Built-in">
            {BUILTIN_PRESET_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
          {userNames.length > 0 && (
            <optgroup label="My presets">
              {userNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <Button onClick={() => setModal('save-preset')}>Save</Button>
      {isUser && preset && (
        <Button onClick={() => deleteUserPreset(preset)} aria-label={`Delete preset ${preset}`}>
          Delete
        </Button>
      )}
    </>
  );
}
