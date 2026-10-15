import { useEffect, useRef } from 'react';
import { useRemote } from './use-remote';
import styles from './RemoteApp.module.css';

const SEMITONES = 12;

/** The phone page: big, thumb-friendly controls for the engine running on the PC. */
export function RemoteApp(): React.ReactElement {
  const { state, connection, send } = useRemote();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** sliders fire a lot: send at most one update every 60 ms */
  const sendVoice = (patch: { pitch?: number; formant?: number }): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send({ type: 'voice', ...patch }), 60);
  };

  const status =
    connection === 'open'
      ? 'connected'
      : connection === 'denied'
        ? 'scan the code again'
        : connection === 'closed'
          ? 'reconnecting…'
          : 'connecting…';

  if (!state) {
    return (
      <div className={styles.page}>
        <Header status={status} live={false} />
        <p className={styles.waiting}>
          {connection === 'denied'
            ? 'This link is no longer valid. Scan the QR code in Voice Studio again.'
            : 'Waiting for Voice Studio on your PC…'}
        </p>
      </div>
    );
  }

  const disabled = connection !== 'open';
  // older PCs only send the short list
  const all =
    state.presets && state.presets.length > 0
      ? state.presets
      : state.chips.map((c) => ({ ...c, user: false }));
  const builtin = all.filter((p) => !p.user);
  const own = all.filter((p) => p.user);

  return (
    <div className={styles.page}>
      <Header status={status} live={connection === 'open'} />

      <section className={styles.live}>
        <button
          type="button"
          className={`${styles.power} ${state.running ? styles.powerOn : ''}`}
          aria-label={state.running ? 'Engine is live. Tap to stop' : 'Engine is off. Tap to start'}
          aria-pressed={state.running}
          disabled={disabled}
          onClick={() => send({ type: 'toggleEngine' })}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3v9M7 6.5a8 8 0 1 0 10 0"
              stroke="currentColor"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div>
          <div className={`${styles.liveState} ${state.running ? styles.liveOn : ''}`}>
            {state.running ? 'LIVE' : 'OFFLINE'}
          </div>
          <div className={styles.voiceName}>{state.preset ?? 'Custom voice'}</div>
          {state.running && <div className={`${styles.stats} mono`}>{state.stats}</div>}
        </div>
      </section>

      <VoiceGrid
        title="Voices"
        presets={builtin}
        active={state.preset}
        disabled={disabled}
        onPick={(key) => send({ type: 'preset', name: key })}
      />
      {own.length > 0 && (
        <VoiceGrid
          title="My voices"
          presets={own}
          active={state.preset}
          disabled={disabled}
          onPick={(key) => send({ type: 'preset', name: key })}
        />
      )}

      <section className={styles.tune} aria-label="Fine tune">
        <Slider
          label="Pitch"
          value={state.pitch}
          disabled={disabled}
          onChange={(pitch) => sendVoice({ pitch })}
        />
        <Slider
          label="Formant"
          value={state.formant}
          disabled={disabled}
          onChange={(formant) => sendVoice({ formant })}
        />
      </section>

      <section className={styles.toggles} aria-label="Switches">
        <Toggle
          label="Hear myself"
          on={state.monitor}
          disabled={disabled}
          onClick={() => send({ type: 'monitor' })}
        />
        <Toggle
          label="Bypass"
          on={state.bypass}
          disabled={disabled}
          onClick={() => send({ type: 'bypass' })}
        />
        <Toggle
          label="Mute"
          on={state.muted}
          danger
          disabled={disabled}
          onClick={() => send({ type: 'mute' })}
        />
      </section>

      {state.sounds.length > 0 && (
        <section className={styles.sounds} aria-label="Sounds">
          {state.sounds.map((sound) => (
            <button
              key={sound.id}
              type="button"
              className={styles.sound}
              disabled={disabled || !state.running}
              onClick={() => send({ type: 'sound', id: sound.id })}
            >
              {sound.name}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function VoiceGrid({
  title,
  presets,
  active,
  disabled,
  onPick,
}: {
  title: string;
  presets: ReadonlyArray<{ key: string; label: string }>;
  active: string | null;
  disabled: boolean;
  onPick(key: string): void;
}): React.ReactElement {
  return (
    <section aria-label={title}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.voices}>
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.voice} ${active === p.key ? styles.voiceOn : ''}`}
            aria-pressed={active === p.key}
            disabled={disabled}
            onClick={() => onPick(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Header({ status, live }: { status: string; live: boolean }): React.ReactElement {
  return (
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
      <div className={styles.title}>Voice Studio</div>
      <span className={`${styles.link} ${live ? styles.linkOn : ''} mono`}>{status}</span>
    </header>
  );
}

function Toggle({
  label,
  on,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  danger?: boolean;
  disabled: boolean;
  onClick(): void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      className={`${styles.toggle} ${on ? (danger ? styles.toggleDanger : styles.toggleOn) : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Slider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange(v: number): void;
}): React.ReactElement {
  const shown = `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} st`;
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        <span className="mono">{shown}</span>
      </span>
      <input
        type="range"
        min={-SEMITONES}
        max={SEMITONES}
        step={0.1}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
