import { useEffect, useMemo, useRef, useState } from 'react';
import { playClip } from '@engine/audio/clip-player';
import { findVirtualCable } from '@engine/audio/devices';
import { MicProbe } from '@engine/audio/mic-probe';
import {
  NOISE_LEVEL_AMOUNT,
  describeNoise,
  suggestGateThreshold,
  suggestInputGain,
  suggestNoiseLevel,
  type LevelStats,
} from '@shared/calibration';
import { signed } from '@shared/format';
import { VOICE_TILES } from '@shared/presets';
import { Modal } from '../../../ui/Modal';
import { Switch } from '../../../ui/Switch';
import { useController, useRuntime, useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import styles from './SetupModal.module.css';

const STEPS = ['Virtual mic', 'Your microphone', 'Headphones', 'Pick a voice'] as const;
type StepIndex = 0 | 1 | 2 | 3;

function Stepper({ step }: { step: StepIndex }): React.ReactElement {
  return (
    <nav className={styles.stepper} aria-label="Setup steps">
      {STEPS.map((name, i) => {
        const state = i < step ? 'done' : i === step ? 'now' : 'next';
        return (
          <div className={styles.stepGroup} key={name}>
            {i > 0 && <div className={`${styles.line} ${i <= step ? styles.lineDone : ''}`} />}
            <div className={styles.step} aria-current={state === 'now' ? 'step' : undefined}>
              <span className={`${styles.badge} ${styles[state]}`}>{state === 'done' ? '✓' : i + 1}</span>
              <span className={`${styles.stepName} ${state === 'next' ? styles.dimName : ''}`}>{name}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* step 1: virtual cable                                               */
/* ------------------------------------------------------------------ */

function CableStep(): React.ReactElement {
  const controller = useController();
  const devices = useStudio((s) => s.devices);
  const found = findVirtualCable(devices.outputs) !== undefined;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const install = async (): Promise<void> => {
    setBusy(true);
    const result = await controller.installCable();
    setBusy(false);
    setMessage(
      result.ok
        ? { ok: true, text: 'The installer is open. Click Install Driver, then restart your PC.' }
        : { ok: false, text: `Could not start the installer: ${result.error}` },
    );
  };

  return (
    <>
      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>Step 1 · Virtual microphone</h3>
        <div className={features.titleLg}>Games need a virtual microphone</div>
        <p className={features.lead}>
          Games only accept real input devices, so Voice Studio sends your changed voice into a free virtual
          audio cable (VB-CABLE).
        </p>
        {found ? (
          <div className={features.good}>
            <b>VB-CABLE is installed</b>
            <div className={features.small}>CABLE Input / CABLE Output found.</div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`${features.btn} ${features.btnPrimary}`}
              disabled={busy}
              onClick={() => void install()}
            >
              Download &amp; start installer
            </button>
            {message && (
              <div className={message.ok ? features.small : features.errorText} role="status">
                {message.text}
              </div>
            )}
            <div className={`${features.small} ${features.dim}`}>
              Official download from vb-audio.com, signature checked. Restart your PC afterwards, then come
              back.
            </div>
          </>
        )}
      </section>
      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>How it works</h3>
        <div className={styles.route}>
          <span>Your mic</span>
          <i>→</i>
          <span className={styles.routeOn}>Voice Studio</span>
          <i>→</i>
          <span>CABLE Input</span>
          <i>→</i>
          <span className={styles.routeOn}>CABLE Output</span>
          <i>→</i>
          <span>Your game</span>
        </div>
        <p className={features.lead}>
          In the game you choose <b>CABLE Output</b> as the microphone, once. Voice Studio does the rest.
        </p>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* step 2: microphone level                                            */
/* ------------------------------------------------------------------ */

const TARGET_LOW = -18;
const TARGET_HIGH = -9;

function barPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export interface MicResult {
  gain: number;
  gate: number;
  noiseLevel: ReturnType<typeof suggestNoiseLevel>;
}

function MicStep({ onResult }: { onResult(result: MicResult | null): void }): React.ReactElement {
  const { devices, dev, setDevice } = useStudio((s) => ({
    devices: s.devices,
    dev: s.dev,
    setDevice: s.setDevice,
  }));
  const controller = useController();
  const probe = useRef(new MicProbe());
  const [level, setLevel] = useState(-120);
  const [stats, setStats] = useState<LevelStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const p = probe.current;
    setError(null);
    setStats(null);
    p.start(dev.in).catch(() => alive && setError('The microphone could not be opened.'));
    const timer = setInterval(() => {
      if (!p.running) return;
      const r = p.read();
      setLevel(r.levelDb);
      const s = p.stats();
      if (s.speechDb > -50) setStats(s);
    }, 60);
    return () => {
      alive = false;
      clearInterval(timer);
      void p.stop();
    };
  }, [dev.in]);

  const result = useMemo<MicResult | null>(() => {
    if (!stats) return null;
    return {
      gain: suggestInputGain(stats.speechDb),
      gate: suggestGateThreshold(stats.noiseDb, stats.speechDb),
      noiseLevel: suggestNoiseLevel(stats.noiseDb),
    };
  }, [stats]);

  useEffect(() => onResult(result), [result, onResult]);

  const noise = stats ? describeNoise(stats.noiseDb) : null;
  const good = stats !== null && stats.speechDb >= TARGET_LOW - 6 && stats.speechDb <= TARGET_HIGH + 3;

  return (
    <>
      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>Step 2 · Your microphone</h3>
        <div className={features.titleLg}>Say something. We&apos;ll set your level.</div>
        <p className={features.lead}>
          Speak in your normal gaming voice for a few seconds. The bar should reach the green zone without
          touching red.
        </p>
        <label className={`${features.small} ${features.muted}`} htmlFor="setup-mic">
          Microphone
        </label>
        <select
          id="setup-mic"
          className={features.select}
          value={dev.in}
          onChange={(e) => {
            setDevice('in', e.target.value);
            void controller.restartIfRunning();
          }}
        >
          <option value="default">System default</option>
          {devices.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        {error && <div className={features.errorText}>{error}</div>}
      </section>

      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>Level check</h3>
        <div>
          <div className={styles.levelHead}>
            <span>Input level</span>
            <span className="mono">{level > -100 ? `${level.toFixed(1).replace('-', '−')} dB` : '–'}</span>
          </div>
          <div
            className={styles.meter}
            role="meter"
            aria-label="Input level"
            aria-valuenow={Math.round(level)}
          >
            <div className={styles.meterFill} style={{ width: `${barPercent(level)}%` }} />
            <div
              className={styles.zone}
              style={{
                left: `${barPercent(TARGET_LOW)}%`,
                width: `${barPercent(TARGET_HIGH) - barPercent(TARGET_LOW)}%`,
              }}
            />
          </div>
          <div className={`${features.small} ${features.dim} ${styles.zoneHint}`}>
            Target zone: −18 to −9 dB
          </div>
        </div>

        {result ? (
          <div className={good ? features.good : `${features.note}`}>
            <b>{good ? 'Level looks good' : 'We adjusted for your level'}</b>
            <div className={features.small}>We&apos;ll set your input gain to {signed(result.gain)} dB.</div>
          </div>
        ) : (
          <div className={features.note}>Waiting for your voice…</div>
        )}

        <div className={styles.facts}>
          <div>
            <span>Background noise</span>
            <span className="mono">
              {stats && noise ? `${Math.max(-90, Math.round(stats.noiseDb))} dB · ${noise.label}` : '–'}
            </span>
          </div>
          <div>
            <span>Suggested gate threshold</span>
            <span className="mono">{result ? `${result.gate} dB` : '–'}</span>
          </div>
          <div>
            <span>Suggested noise removal</span>
            <span className="mono">{result ? result.noiseLevel : '–'}</span>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* step 3: headphones                                                  */
/* ------------------------------------------------------------------ */

function HeadphonesStep(): React.ReactElement {
  const controller = useController();
  const { devices, dev, monitor, setMonitor } = useStudio((s) => ({
    devices: s.devices,
    dev: s.dev,
    monitor: s.monitor,
    setMonitor: s.setMonitor,
  }));
  const [testing, setTesting] = useState(false);

  const test = async (): Promise<void> => {
    setTesting(true);
    const rate = 48000;
    const samples = new Float32Array(rate * 0.9);
    for (let i = 0; i < samples.length; i++) {
      const env = Math.min(1, i / 2400, (samples.length - i) / 2400);
      samples[i] = 0.18 * env * Math.sin((2 * Math.PI * (i < samples.length / 2 ? 523 : 659) * i) / rate);
    }
    try {
      const handle = await playClip(samples, rate, dev.mon);
      await handle.done;
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>Step 3 · Headphones</h3>
        <div className={features.titleLg}>Where do you hear yourself?</div>
        <p className={features.lead}>
          Pick your headphones. Never use speakers: the microphone would pick them up and your teammates would
          hear an echo.
        </p>
        <label className={`${features.small} ${features.muted}`} htmlFor="setup-mon">
          Headphones
        </label>
        <select
          id="setup-mon"
          className={features.select}
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
        <button type="button" className={features.btn} disabled={testing} onClick={() => void test()}>
          {testing ? 'Playing…' : 'Play a test sound'}
        </button>
      </section>
      <section className={`${features.card} ${features.cardRoomy}`}>
        <h3 className={features.eyebrow}>Hear myself</h3>
        <div className={features.switchRow}>
          <span className={features.grow}>Hear my own voice in the headphones</span>
          <Switch label="Hear myself" checked={monitor.on} onChange={(on) => setMonitor({ on })} />
        </div>
        <p className={features.lead}>
          Handy while you set things up. You can switch it off any time from the Devices card.
        </p>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* step 4: voice                                                       */
/* ------------------------------------------------------------------ */

function VoiceStep(): React.ReactElement {
  const { preset, applyPreset } = useStudio((s) => ({ preset: s.preset, applyPreset: s.applyPreset }));
  return (
    <>
      <section className={`${features.card} ${features.cardRoomy} ${styles.wide}`}>
        <h3 className={features.eyebrow}>Step 4 · Pick a voice</h3>
        <div className={features.titleLg}>Choose how you want to sound</div>
        <p className={features.lead}>You can change it any time, and fine-tune it with the voice pad.</p>
        <div className={styles.voices}>
          {VOICE_TILES.map((tile) => (
            <button
              key={tile.key}
              type="button"
              aria-pressed={preset === tile.key}
              className={`${styles.voice} ${preset === tile.key ? styles.voiceOn : ''}`}
              onClick={() => applyPreset(tile.key)}
            >
              <span className={features.dot} style={{ background: tile.color }} />
              {tile.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* the wizard                                                          */
/* ------------------------------------------------------------------ */

export function SetupModal(): React.ReactElement {
  const { api } = useRuntime();
  const controller = useController();
  const store = useRuntime().store;
  const setModal = useStudio((s) => s.setModal);
  const [step, setStep] = useState<StepIndex>(0);
  const micResult = useRef<MicResult | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void api.appInfo().then((i) => setVersion(i.version));
  }, [api]);

  const finish = (start: boolean): void => {
    store.getState().setSetupDone(true);
    setModal(null);
    if (start) void controller.start();
  };

  const applyMic = (): void => {
    const r = micResult.current;
    if (!r) return;
    const s = store.getState();
    s.setGain('inGain', r.gain);
    s.patchModule('exp', { thresh: r.gate });
    s.patchModule('noise', { amount: NOISE_LEVEL_AMOUNT[r.noiseLevel], on: r.noiseLevel !== 'Light' });
  };

  const next = (): void => {
    if (step === 1) applyMic();
    if (step < 3) setStep((step + 1) as StepIndex);
    else finish(true);
  };

  return (
    <Modal title="Welcome to Voice Studio" onClose={() => finish(false)} width={880} tone="page">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.logo} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                d="M4 11v2M8 8v8M12 4v16M16 8v8M20 11v2"
                stroke="#5eead4"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <div className={styles.welcome}>Welcome to Voice Studio</div>
          {version && <span className={`${styles.version} mono`}>v{version}</span>}
          <button type="button" className={styles.skip} onClick={() => finish(false)}>
            Skip setup
          </button>
        </header>

        <Stepper step={step} />

        <div className={`${styles.content} ${step === 3 ? styles.single : ''}`}>
          {step === 0 && <CableStep />}
          {step === 1 && (
            <MicStep
              onResult={(r) => {
                micResult.current = r;
              }}
            />
          )}
          {step === 2 && <HeadphonesStep />}
          {step === 3 && <VoiceStep />}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={features.btn}
            disabled={step === 0}
            onClick={() => setStep((step - 1) as StepIndex)}
          >
            Back
          </button>
          <button type="button" className={`${features.btn} ${features.btnPrimary}`} onClick={next}>
            {step === 3 ? 'Start engine' : 'Next'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
