import { Switch } from '../../../ui/Switch';
import { useRuntime, useStudio } from '../../runtime/react';
import styles from './MusicSwitch.module.css';

/** Shows / hides the floating music bar. Turning it off also stops the music and closes the playlist. */
export function MusicSwitch(): React.ReactElement {
  const show = useStudio((s) => s.music.show);
  const { store, player } = useRuntime();

  return (
    <label className={styles.label} title="Show or hide the floating music player">
      Music
      <Switch
        label="Show music player"
        checked={show}
        onChange={(next) => {
          store.getState().setMusic({ show: next });
          if (!next) player.pause();
        }}
      />
    </label>
  );
}
