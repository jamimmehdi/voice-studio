import { useEffect, useState } from 'react';
import { Button } from '../../../ui/Button';
import { useRuntime } from '../../runtime/react';
import { acceleratorFromEvent } from '../../lib/accelerator';
import styles from './modal.module.css';

/** Shows the compact-panel shortcut and records a new key combination when clicked. */
export function ShortcutField(): React.ReactElement {
  const { api } = useRuntime();
  const [label, setLabel] = useState('Ctrl + Alt + V');
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api.settings.get().then((s) => setLabel(s.shortcutLabel));
  }, [api]);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        setMessage(null);
        return;
      }
      const result = acceleratorFromEvent(e);
      if (result.kind === 'wait') return;
      if (result.kind === 'invalid') {
        setMessage({ ok: false, text: result.reason });
        return;
      }
      setCapturing(false);
      const response = await api.settings.setShortcut(result.accelerator);
      if (response.ok) {
        setLabel(response.shortcutLabel);
        setMessage({ ok: true, text: 'Shortcut saved.' });
      } else {
        setMessage({ ok: false, text: response.error });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, api]);

  return (
    <div>
      <div className={styles.row}>
        <span className={`${styles.small} ${styles.muted}`}>Shortcut to show / shrink the compact panel</span>
        <Button
          onClick={() => {
            setCapturing(true);
            setMessage({
              ok: true,
              text: 'Press the new shortcut (Ctrl / Alt / Shift + a key). Esc cancels.',
            });
          }}
        >
          {capturing ? 'Press the new shortcut…' : label}
        </Button>
      </div>
      {message && (
        <div role="status" className={`${styles.small} ${message.ok ? styles.muted : styles.warn}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
