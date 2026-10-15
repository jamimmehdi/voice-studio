import type { QuickApi } from '@shared/ipc';
import type { QuickState } from '@shared/protocols';
import { LiveCard } from './components/LiveCard';
import { MiniPlayer } from './components/MiniPlayer';
import { ToggleRow } from './components/ToggleRow';
import { TuneCard } from './components/TuneCard';
import { VoiceChips } from './components/VoiceChips';
import { useQuickState } from './use-quick-state';
import styles from './QuickApp.module.css';

export const EMPTY_QUICK_STATE: QuickState = {
  running: false,
  preset: null,
  chips: [],
  pitch: 0,
  formant: 0,
  monitor: false,
  bypass: false,
  gate: true,
  level: 0,
  stats: '',
  music: { has: false, title: '', playing: false, progress: 0 },
  sounds: [],
  muted: false,
};

interface QuickAppProps {
  api?: Pick<QuickApi, 'send' | 'onState'>;
}

/** The compact in-game panel: a small remote control for the studio window's engine. */
export function QuickApp({ api = window.quick }: QuickAppProps): React.ReactElement {
  const state = useQuickState(api) ?? EMPTY_QUICK_STATE;
  const send = api.send;

  return (
    <div className={styles.panel}>
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
        <button
          type="button"
          className={styles.headBtn}
          title="Open the full studio"
          onClick={() => send({ type: 'openStudio' })}
        >
          Full studio ⤢
        </button>
        <button
          type="button"
          className={`${styles.headBtn} ${styles.square}`}
          aria-label="Shrink to a floating icon"
          title="Shrink to a floating icon"
          onClick={() => send({ type: 'minimizeToIcon' })}
        >
          —
        </button>
        <button
          type="button"
          className={`${styles.headBtn} ${styles.square}`}
          aria-label="Hide"
          title="Hide (keeps running in the tray)"
          onClick={() => send({ type: 'hideCompact' })}
        >
          ×
        </button>
      </header>

      <LiveCard state={state} onToggle={() => send({ type: 'toggleEngine' })} />
      <VoiceChips
        chips={state.chips}
        active={state.preset}
        onPick={(name) => send({ type: 'preset', name })}
      />
      <TuneCard
        pitch={state.pitch}
        formant={state.formant}
        onPitch={(pitch) => send({ type: 'voice', pitch })}
        onFormant={(formant) => send({ type: 'voice', formant })}
      />
      <ToggleRow
        monitor={state.monitor}
        bypass={state.bypass}
        gate={state.gate}
        onMonitor={() => send({ type: 'monitor' })}
        onBypass={() => send({ type: 'bypass' })}
        onGate={() => send({ type: 'gate' })}
      />
      <MiniPlayer music={state.music} enabled={state.running} onToggle={() => send({ type: 'music' })} />
    </div>
  );
}
