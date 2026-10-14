import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  /** small text aligned to the right of the title */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: 'normal' | 'roomy';
  /** `aria-label` for cards without a visible title */
  label?: string;
}

/** Rounded panel with the small-caps heading used throughout the studio. */
export function Card({
  title,
  aside,
  children,
  className,
  padding = 'normal',
  label,
}: CardProps): React.ReactElement {
  return (
    <section
      className={`${styles.card} ${padding === 'roomy' ? styles.roomy : ''} ${className ?? ''}`}
      aria-label={label ?? title}
    >
      {title && (
        <div className={aside ? styles.headRow : undefined}>
          <h2 className={styles.title}>{title}</h2>
          {aside && <span className={styles.aside}>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
