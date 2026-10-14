import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  /** accessible name (required: a switch has no visible text) */
  label: string;
  size?: 'md' | 'sm' | 'xs';
  disabled?: boolean;
  className?: string;
}

/** Toggle switch rendered as a real `<button role="switch">` so it is keyboard and screen-reader friendly. */
export function Switch({ checked, onChange, label, size = 'md', disabled, className }: SwitchProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.switch, styles[size], checked ? styles.on : '', className ?? ''].join(' ').trim()}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}
