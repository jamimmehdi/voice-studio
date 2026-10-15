import { useEffect, useState } from 'react';
import type { RemoteView } from '@shared/ipc';
import { Modal } from '../../../ui/Modal';
import { Switch } from '../../../ui/Switch';
import { useRuntime, useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import styles from './RemoteModal.module.css';

const EMPTY: RemoteView = { enabled: false, url: null, qr: null, devices: [], error: null };

function since(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  return minutes < 1 ? 'Connected just now' : `Connected ${minutes} min ago`;
}

/** Pairing screen of the phone remote: switch, QR code, address and connected devices. */
export function RemoteModal(): React.ReactElement {
  const { api } = useRuntime();
  const setModal = useStudio((s) => s.setModal);
  const [view, setView] = useState<RemoteView>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.remote.get().then((v) => alive && setView(v));
    const off = api.remote.onDevices((devices) => {
      if (alive) setView((v) => ({ ...v, devices }));
    });
    return () => {
      alive = false;
      off();
    };
  }, [api]);

  const run = async (action: () => Promise<RemoteView>): Promise<void> => {
    setBusy(true);
    try {
      setView(await action());
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (!view.url) return;
    try {
      await navigator.clipboard.writeText(view.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <Modal title="Phone remote" onClose={() => setModal(null)} width={640} tone="page">
      <section className={`${features.card} ${features.cardRoomy}`} aria-label="Phone remote">
        <div className={features.head}>
          <h3 className={`${features.eyebrow} ${features.grow}`}>Phone remote</h3>
          <span className={styles.enabled}>{view.enabled ? 'Enabled' : 'Off'}</span>
          <Switch
            label="Phone remote"
            checked={view.enabled}
            disabled={busy}
            onChange={(on) => void run(() => api.remote.setEnabled(on))}
          />
        </div>

        <div className={features.title}>Control your voice from your phone</div>
        <p className={features.lead}>
          Works with any game mode, including exclusive fullscreen. Your phone and PC must be on the same
          Wi-Fi.
        </p>

        {view.error && (
          <div className={features.note} role="alert">
            {view.error}
          </div>
        )}

        {view.enabled && view.url ? (
          <div className={styles.pair}>
            {view.qr ? (
              <img
                className={styles.qr}
                src={view.qr}
                alt="QR code to open the remote"
                width={150}
                height={150}
              />
            ) : (
              <div className={styles.qr} />
            )}
            <div className={styles.pairText}>
              <b>Scan with your phone camera</b>
              <span className={features.small}>Or open this address in a browser:</span>
              <code className={styles.url}>{view.url}</code>
              <div className={styles.pairButtons}>
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm}`}
                  onClick={() => void copy()}
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm}`}
                  disabled={busy}
                  onClick={() => void run(() => api.remote.newCode())}
                >
                  New code
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={features.emptyHint}>
            {view.enabled
              ? 'This PC is not connected to a network, so there is nothing to scan.'
              : 'Turn the remote on to get a QR code for your phone.'}
          </div>
        )}

        <div>
          <div className={styles.devicesHead}>Connected devices</div>
          {view.devices.length === 0 ? (
            <div className={`${features.small} ${features.dim}`}>No phone is connected.</div>
          ) : (
            view.devices.map((device) => (
              <div className={features.item} key={device.id}>
                <span className={`${features.dot} ${styles.live}`} />
                <div className={features.grow}>
                  <div className={styles.deviceName}>{device.name}</div>
                  <div className={`${features.small} ${features.muted}`}>
                    {since(device.since, Date.now())}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm} ${features.btnDanger}`}
                  onClick={() => void api.remote.disconnect(device.id)}
                >
                  Disconnect
                </button>
              </div>
            ))
          )}
        </div>

        <div className={features.note}>
          Only devices that scan this code can connect. The remote sends commands only. Your voice never
          leaves the PC.
        </div>
      </section>
    </Modal>
  );
}
