import { useEffect } from 'react';
import { findVirtualCable, looksLikeCable } from '@engine/audio/devices';
import { Card } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { useController, useStudio } from '../../runtime/react';
import { selectedDeviceLabel } from '../../lib/stage-summary';
import { DeviceSelect } from './DeviceSelect';
import { MonitorControls } from './MonitorControls';
import styles from './DevicesCard.module.css';

/** Result of looking at the device lists: what to tell the user about the virtual microphone. */
export type CableStatus = 'detecting' | 'ready' | 'available' | 'missing';

export function cableStatus(
  hasLabels: boolean,
  outputs: readonly { deviceId: string; label: string }[],
  selectedOutputId: string,
): CableStatus {
  if (!hasLabels) return 'detecting';
  const selectedLabel = selectedDeviceLabel(outputs, selectedOutputId);
  if (looksLikeCable(selectedLabel)) return 'ready';
  return findVirtualCable(outputs) ? 'available' : 'missing';
}

const MESSAGES: Record<CableStatus, string> = {
  detecting: 'Detecting audio devices…',
  ready: 'Virtual mic ready. In your game pick CABLE Output.',
  available: 'Virtual cable found – select “CABLE Input” above to feed your game.',
  missing: 'No virtual microphone found – it is required to use this in games.',
};

export function DevicesCard(): React.ReactElement {
  const { devices, dev, setModal } = useStudio((s) => ({
    devices: s.devices,
    dev: s.dev,
    setModal: s.setModal,
  }));
  const controller = useController();

  useEffect(() => {
    void controller.ensureDeviceLabels();
    const onChange = (): void => void controller.refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [controller]);

  const status = cableStatus(devices.hasLabels, devices.outputs, dev.out);

  return (
    <Card title="Devices">
      <DeviceSelect
        id="mic-select"
        label="Microphone"
        value={dev.in}
        devices={devices.inputs}
        onChange={(id) => void controller.setInputDevice(id)}
      />
      <DeviceSelect
        id="out-select"
        label="Send to game / chat"
        value={dev.out}
        devices={devices.outputs}
        onChange={(id) => void controller.setOutputDevice(id)}
      />
      <div
        role="status"
        className={`${styles.hint} ${status === 'ready' ? styles.ok : status === 'detecting' ? '' : styles.bad}`}
      >
        {MESSAGES[status]}
      </div>
      {status === 'missing' && (
        <Button variant="primary" block className={styles.install} onClick={() => setModal('cable')}>
          Install virtual microphone (VB-CABLE)
        </Button>
      )}
      <div className={styles.divider} />
      <MonitorControls />
    </Card>
  );
}
