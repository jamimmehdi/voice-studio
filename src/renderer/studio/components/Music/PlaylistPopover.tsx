import { useRef, useState } from 'react';
import { Button } from '../../../ui/Button';
import { ToggleButton } from '../../../ui/ToggleButton';
import { useController, usePlaylist, useRuntime, useStudio } from '../../runtime/react';
import styles from './PlaylistPopover.module.css';

interface PlaylistPopoverProps {
  onClose(): void;
}

/** Playlist, file picker and link box that open above the music dock. */
export function PlaylistPopover({ onClose }: PlaylistPopoverProps): React.ReactElement {
  const { player } = useRuntime();
  const controller = useController();
  const { names, index } = usePlaylist();
  const { loop, setMusic } = useStudio((s) => ({ loop: s.music.loop, setMusic: s.setMusic }));
  const file = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const addLink = async (): Promise<void> => {
    if (!link.trim() || busy) return;
    setBusy(true);
    const ok = await controller.addLink(link);
    setBusy(false);
    if (ok) setLink('');
  };

  return (
    <div className={styles.popover} role="dialog" aria-label="Playlist">
      <div className={styles.bar}>
        <Button onClick={() => file.current?.click()}>+ Add files…</Button>
        <Button onClick={() => player.clear()}>Clear</Button>
        <ToggleButton pressed={loop} onChange={(v) => setMusic({ loop: v })}>
          Loop
        </ToggleButton>
        <Button onClick={onClose}>Close</Button>
        <input
          ref={file}
          type="file"
          accept="audio/*"
          multiple
          hidden
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) player.addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
      </div>

      <div className={styles.bar}>
        <input
          className={styles.url}
          type="text"
          placeholder="Paste YouTube / audio link…"
          aria-label="Link to add"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addLink();
          }}
        />
        <Button disabled={busy} onClick={() => void addLink()}>
          {busy ? 'Loading…' : 'Add link'}
        </Button>
      </div>

      <div className={styles.list} role="listbox" aria-label="Tracks">
        {names.length === 0 ? (
          <div className={styles.empty}>No tracks yet – add audio files (mp3, wav, flac, ogg, m4a).</div>
        ) : (
          names.map((name, i) => (
            <div
              key={`${i}-${name}`}
              role="option"
              aria-selected={i === index}
              className={`${styles.track} ${i === index ? styles.current : ''}`}
              onClick={() => player.select(i, true)}
            >
              <span className={styles.trackName}>
                {i + 1}. {name}
              </span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  player.remove(i);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
