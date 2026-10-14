import styles from './SelectField.module.css';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
}

export interface SelectFieldProps<V extends string | number> {
  label: string;
  value: V;
  options: readonly SelectOption<V>[];
  onChange(value: V): void;
  className?: string;
}

/** Small labelled `<select>` (label above, like the knob labels). */
export function SelectField<V extends string | number>({
  label, value, options, onChange, className,
}: SelectFieldProps<V>): React.ReactElement {
  return (
    <label className={`${styles.field} ${className ?? ''}`}>
      {label}
      <select
        className={styles.select}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
