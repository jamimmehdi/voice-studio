import { shortDeviceLabel } from '@engine/audio/devices';
import { BarSlider } from '../../../ui/BarSlider';
import { Switch } from '../../../ui/Switch';
import { selectedDeviceLabel } from '../../lib/stage-summary';
import { useController, useStudio } from '../../runtime/react';
import styles from './MonitorControls.module.css';

/** "Hear myself": monitor device, volume and the on/off switch. */
export function MonitorControls(): React.ReactElement {
  const { monitor, dev, devices, setMonitor } = useStudio((s) => ({
    monitor: s.monitor,
    dev: s.dev,
    devices: s.devices,
    setMonitor: s.setMonitor,
  }));
  const controller = useController();
  const deviceName = shortDeviceLabel(selectedDeviceLabel(devices.outputs, dev.mon));

  return (
    <div>
      <div className={styles.row}>
        <span className={styles.title}>Hear myself</span>
        <Switch label="Hear myself" checked={monitor.on} onChange={(on) => setMonitor({ on })} />
      </div>
      <div className={styles.sub}>
        <select
          className={styles.device}
          aria-label="Monitor device"
          title={deviceName}
          value={dev.mon}
          onChange={(e) => void controller.setMonitorDevice(e.target.value)}
        >
          <option value="default">System default</option>
          {devices.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <span className={styles.volume}> · volume {Math.round(monitor.vol * 100)}%</span>
      </div>
      <BarSlider
        label="Monitor volume"
        value={monitor.vol}
        min={0}
        max={1}
        step={0.01}
        size="sm"
        onChange={(vol) => setMonitor({ vol })}
      />
    </div>
  );
}
