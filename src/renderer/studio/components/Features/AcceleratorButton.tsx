import { useEffect, useState } from 'react';
import { prettyAccelerator } from '@shared/format';
import { acceleratorFromEvent } from '../../lib/accelerator';
import styles from './features.module.css';

interface AcceleratorButtonProps {
  value: string | null;
  onChange(accelerator: string | null): void;
  /** what to show when nothing is assigned */
  emptyLabel?: string;
  ariaLabel: string;
}

/**
 * A key-cap that records the next key combination when clicked.
 * Esc cancels, Backspace / Delete clears the assignment.
 */
export function AcceleratorButton({
  value,
  onChange,
  emptyLabel = 'Set key',
  ariaLabel,
}: AcceleratorButtonProps): React.ReactElement {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setCapturing(false);
        onChange(null);
        return;
      }
      const result = acceleratorFromEvent(e);
      if (result.kind !== 'ok') return;
      setCapturing(false);
      onChange(result.accelerator);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onChange]);

  const text = capturing
    ? 'Press keys…'
    : value
      ? prettyAccelerator(value).replace(/ \+ /g, '+')
      : emptyLabel;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title="Click, then press the key combination. Backspace clears."
      className={`${styles.kbd} ${!value && !capturing ? styles.kbdUnset : ''} ${capturing ? styles.kbdCapturing : ''}`}
      onClick={() => setCapturing((c) => !c)}
    >
      {text}
    </button>
  );
}
