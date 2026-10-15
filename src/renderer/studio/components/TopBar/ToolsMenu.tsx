import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../ui/Button';
import { useStudio } from '../../runtime/react';
import type { ModalId } from '../../store/studio-store';
import styles from './ToolsMenu.module.css';

interface Tool {
  modal: ModalId;
  title: string;
  sub: string;
}

const TOOLS: readonly Tool[] = [
  { modal: 'soundboard', title: 'Soundboard & hotkeys', sub: 'Play clips, jump to a voice with a key' },
  { modal: 'profiles', title: 'App profiles', sub: 'Switch voice automatically per game' },
  { modal: 'library', title: 'Voice library', sub: 'Import, export, A/B test, find my voice' },
  { modal: 'remote', title: 'Phone remote', sub: 'Control Voice Studio from your phone' },
  { modal: 'diagnose', title: "Why can't they hear me?", sub: 'Check the path to your game' },
  { modal: 'setup', title: 'Setup wizard', sub: 'Microphone, headphones and voice' },
];

/** "Tools" button with a small menu that opens the feature screens. */
export function ToolsMenu(): React.ReactElement {
  const setModal = useStudio((s) => s.setModal);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={root}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Tools <span aria-hidden="true">▾</span>
      </Button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Tools">
          {TOOLS.map((tool) => (
            <button
              key={tool.modal}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                setModal(tool.modal);
              }}
            >
              <b>{tool.title}</b>
              <span>{tool.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
