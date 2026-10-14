import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  /** centre the content (About) */
  centered?: boolean;
}

/** Dialog with a backdrop; closes on Escape or a click outside the sheet. */
export function Modal({ title, onClose, children, centered }: ModalProps): React.ReactElement {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    sheet.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${styles.sheet} ${centered ? styles.centered : ''}`}
      >
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
