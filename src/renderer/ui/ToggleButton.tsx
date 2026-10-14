import type { ButtonHTMLAttributes } from 'react';
import styles from './ToggleButton.module.css';

export interface ToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onChange(next: boolean): void;
}

/** A button that stays pressed (e.g. "Robot voice", "Listen"). */
export function ToggleButton({ pressed, onChange, className, children, ...rest }: ToggleButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${styles.toggle} ${pressed ? styles.on : ''} ${className ?? ''}`}
      onClick={() => onChange(!pressed)}
      {...rest}
    >
      {children}
    </button>
  );
}
