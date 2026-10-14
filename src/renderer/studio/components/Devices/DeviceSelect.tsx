import type { AudioDevice } from '@engine/audio/devices';
import styles from './DeviceSelect.module.css';

interface DeviceSelectProps {
  id: string;
  label: string;
  value: string;
  devices: readonly AudioDevice[];
  onChange(deviceId: string): void;
}

/** Labelled `<select>` listing "System default" plus the real devices. */
export function DeviceSelect({ id, label, value, devices, onChange }: DeviceSelectProps): React.ReactElement {
  // keep an unplugged device selectable so the control does not silently jump to another one
  const known = value === 'default' || devices.some((d) => d.deviceId === value);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select id={id} className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="default">System default</option>
        {!known && <option value={value}>Unavailable device</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
