import { useCallback, useEffect, useRef, useState } from 'react';
import { findVirtualCable } from '@engine/audio/devices';
import { countProblems, runDiagnostics, type CheckResult, type FixAction } from '@shared/diagnostics';
import { Modal } from '../../../ui/Modal';
import { useController, useRuntime, useStudio } from '../../runtime/react';
import { selectedDeviceLabel } from '../../lib/stage-summary';
import features from '../Features/features.module.css';
import styles from './DiagnoseModal.module.css';

const SAMPLE_MS = 1500;

function Icon({ status }: { status: CheckResult['status'] }): React.ReactElement {
  if (status === 'pass') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 12l5 5 9-10"
          stroke="#34f5c5"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7v6M12 17v.5" stroke="#ff9a5c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="#667286" strokeWidth="2" fill="none" />
      <path d="M12 11v5M12 8v.5" stroke="#667286" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** "Why can't they hear me?": checks the whole path from the microphone to the game. */
export function DiagnoseModal(): React.ReactElement {
  const { hub, engine } = useRuntime();
  const controller = useController();
  const { devices, dev, running, setModal, setStage } = useStudio((s) => ({
    devices: s.devices,
    dev: s.dev,
    running: s.engine === 'running',
    setModal: s.setModal,
    setStage: s.setStage,
  }));
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);

  const check = useCallback(() => {
    setResults(null);
    setCopied(false);
    let peak = 0;
    const off = hub.subscribe((m) => {
      peak = Math.max(peak, m.inPeak);
    });
    window.setTimeout(() => {
      off();
      if (!alive.current) return;
      const cable = findVirtualCable(devices.outputs);
      setResults(
        runDiagnostics({
          engineRunning: engine.running,
          inputPeak: peak,
          inputLabel: selectedDeviceLabel(devices.inputs, dev.in),
          latencyMs: engine.latencyMs,
          dropouts: engine.meters?.dropouts ?? 0,
          cableFound: cable !== undefined,
          outputIsCable: cable !== undefined && dev.out === cable.deviceId,
          outputLabel: selectedDeviceLabel(devices.outputs, dev.out),
        }),
      );
    }, SAMPLE_MS);
  }, [hub, engine, devices, dev]);

  useEffect(() => {
    alive.current = true;
    check();
    return () => {
      alive.current = false;
    };
    // run once when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fix = async (action: FixAction): Promise<void> => {
    switch (action) {
      case 'start-engine':
        await controller.start();
        break;
      case 'use-cable': {
        const cable = findVirtualCable(devices.outputs);
        if (cable) await controller.setOutputDevice(cable.deviceId);
        break;
      }
      case 'install-cable':
        setModal('cable');
        return;
      case 'show-guide':
        setModal('guide');
        return;
      case 'open-devices':
        setStage('mic');
        setModal(null);
        return;
    }
    check();
  };

  const copyReport = async (): Promise<void> => {
    if (!results) return;
    const text = [
      'Voice Studio report',
      ...results.map((r) => `[${r.status}] ${r.title} - ${r.detail}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const summary = results ? countProblems(results) : null;

  return (
    <Modal title="Why can't they hear me?" onClose={() => setModal(null)} width={520}>
      <div className={features.page}>
        <div>
          <h3 className={styles.heading}>Why can&apos;t they hear me?</h3>
          <p className={`${features.lead} ${styles.sub}`}>
            Checks the whole path from your mic to the game, in about 3 seconds.
          </p>
        </div>

        {summary === null ? (
          <div className={styles.checking} role="status">
            Checking…{running ? '' : ' (the engine is stopped)'}
          </div>
        ) : summary.problems > 0 ? (
          <div className={styles.banner} role="status">
            {summary.problems} problem{summary.problems === 1 ? '' : 's'} found · {summary.fixable} can be
            fixed automatically
          </div>
        ) : (
          <div className={`${styles.banner} ${styles.ok}`} role="status">
            Everything on this PC looks right.
          </div>
        )}

        <ul className={styles.list} aria-label="Checks">
          {(results ?? []).map((r) => (
            <li key={r.id} className={`${styles.row} ${r.status === 'fail' ? styles.fail : ''}`}>
              <Icon status={r.status} />
              <div className={styles.text}>
                <b>{r.title}</b>
                <span>{r.detail}</span>
              </div>
              {r.fix && r.status !== 'pass' && (
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm} ${r.status === 'fail' ? features.btnPrimary : ''}`}
                  onClick={() => void fix(r.fix!.action)}
                >
                  {r.fix.label}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <button type="button" className={features.btn} onClick={check}>
            Run again
          </button>
          <button
            type="button"
            className={features.btnLink}
            disabled={!results}
            onClick={() => void copyReport()}
          >
            {copied ? 'Copied' : 'Copy report for support'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
