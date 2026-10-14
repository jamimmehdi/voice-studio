import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'update' | 'record' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** stretch to the container's width */
  block?: boolean;
  /** 38x38 round icon button */
  icon?: boolean;
}

export function Button({
  variant = 'default',
  block,
  icon,
  className,
  type = 'button',
  ...rest
}: ButtonProps): React.ReactElement {
  const classes = [
    styles.button,
    styles[variant],
    block ? styles.block : '',
    icon ? styles.icon : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
