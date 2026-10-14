import styles from './ToggleRow.module.css';

interface ToggleRowProps {
  monitor: boolean;
  bypass: boolean;
  gate: boolean;
  onMonitor(): void;
  onBypass(): void;
  onGate(): void;
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick(): void }): React.ReactElement {
  return (
    <button type="button" aria-pressed={on} className={`${styles.toggle} ${on ? styles.on : ''}`} onClick={onClick}>
      <b>{label}</b>
      <span>{on ? 'On' : 'Off'}</span>
    </button>
  );
}

export function ToggleRow({ monitor, bypass, gate, onMonitor, onBypass, onGate }: ToggleRowProps): React.ReactElement {
  return (
    <section className={styles.row}>
      <Toggle label="Hear myself" on={monitor} onClick={onMonitor} />
      <Toggle label="Bypass" on={bypass} onClick={onBypass} />
      <Toggle label="Noise gate" on={gate} onClick={onGate} />
    </section>
  );
}
