import { useEffect, useRef, useState } from 'react';
import { appNameFromExe, type ProfileApp, type RunningApp } from '@shared/features';
import { BUILTIN_PRESET_NAMES } from '@shared/presets';
import { Modal } from '../../../ui/Modal';
import { Switch } from '../../../ui/Switch';
import { useRuntime, useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import styles from './ProfilesModal.module.css';

const TINTS = [
  { bg: '#2a1215', border: '#5a2a30', fg: '#ff7a85' },
  { bg: '#1a1d3a', border: '#2f3566', fg: '#8b9bff' },
  { bg: '#1c2230', border: '#2f3b52', fg: '#aeb8c9' },
  { bg: '#10241f', border: '#1f6b5c', fg: '#6fe0b5' },
];

function tintFor(exe: string): (typeof TINTS)[number] {
  let h = 0;
  for (const ch of exe) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/** Programs that do not make sense as a game profile. */
const IGNORED = new Set([
  'explorer.exe',
  'applicationframehost.exe',
  'textinputhost.exe',
  'voice studio.exe',
]);

/** "App profiles": per-program voice that is loaded when the program comes to the front. */
export function ProfilesModal(): React.ReactElement {
  const { api } = useRuntime();
  const { profiles, foreground, preset, userPresets, setModal } = useStudio((s) => ({
    profiles: s.profiles,
    foreground: s.foreground,
    preset: s.preset,
    userPresets: s.userPresets,
    setModal: s.setModal,
  }));
  const store = useRuntime().store;
  const [picker, setPicker] = useState<RunningApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const browse = useRef<HTMLInputElement>(null);

  // a freshly opened screen shows who is in front right now
  useEffect(() => {
    if (profiles.enabled) void api.foreground.setActive(true);
  }, [api, profiles.enabled]);

  const voiceNames = [...BUILTIN_PRESET_NAMES, ...Object.keys(userPresets)];

  const addApp = (app: RunningApp): void => {
    store.getState().upsertProfile({
      exe: app.exe,
      name: app.name,
      preset: preset ?? null,
      start: false,
    });
    setPicker(null);
  };

  const showRunning = async (): Promise<void> => {
    if (picker) {
      setPicker(null);
      return;
    }
    setLoading(true);
    const running = await api.foreground.listRunning();
    setLoading(false);
    setPicker(running.filter((a) => !IGNORED.has(a.exe) && !profiles.apps.some((p) => p.exe === a.exe)));
  };

  const voiceSelect = (
    app: ProfileApp,
    value: string | null,
    onChange: (v: string | null) => void,
  ): React.ReactElement => (
    <select
      aria-label={`Voice for ${app.name}`}
      className={features.select}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Keep current voice</option>
      {voiceNames.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );

  return (
    <Modal title="App profiles" onClose={() => setModal(null)} width={900} tone="page">
      <div className={features.page}>
        <section className={`${features.card} ${styles.intro}`}>
          <div className={features.grow}>
            <h3 className={features.eyebrow}>App profiles</h3>
            <div className={`${features.title} ${styles.introTitle}`}>
              Switch voice automatically per game
            </div>
            <p className={`${features.lead} ${styles.introLead}`}>
              When one of these apps is in front, Voice Studio loads its voice. When you leave, it goes back
              to your default.
            </p>
          </div>
          <div className={styles.auto}>
            <span>Auto-switch</span>
            <Switch
              label="Auto-switch"
              checked={profiles.enabled}
              onChange={(v) => store.getState().setProfilesEnabled(v)}
            />
          </div>
        </section>

        <section className={`${features.card} ${styles.table}`} aria-label="Profiles">
          <div className={`${styles.cols} ${styles.header}`}>
            <span>App</span>
            <span>Voice</span>
            <span>Start engine</span>
            <span />
          </div>

          {profiles.apps.length === 0 && (
            <div className={styles.empty}>
              No apps yet. Add the game you play, then pick the voice it should use.
            </div>
          )}

          {profiles.apps.map((app) => {
            const tint = tintFor(app.exe);
            const active = foreground === app.exe;
            return (
              <div className={`${styles.cols} ${styles.row}`} key={app.exe}>
                <div className={styles.app}>
                  <div
                    className={styles.letter}
                    style={{ background: tint.bg, borderColor: tint.border, color: tint.fg }}
                    aria-hidden="true"
                  >
                    {app.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.names}>
                    <b>{app.name}</b>
                    <span className="mono">{app.exe}</span>
                  </div>
                  {active && <span className={features.badge}>Active now</span>}
                </div>
                {voiceSelect(app, app.preset, (v) => store.getState().patchProfile(app.exe, { preset: v }))}
                <select
                  aria-label={`Start engine for ${app.name}`}
                  className={`${features.select} ${styles.yesNo}`}
                  value={app.start ? 'yes' : 'no'}
                  onChange={(e) =>
                    store.getState().patchProfile(app.exe, { start: e.target.value === 'yes' })
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${app.name}`}
                  onClick={() => store.getState().removeProfile(app.exe)}
                >
                  ×
                </button>
              </div>
            );
          })}

          <div className={styles.footer}>
            <button
              type="button"
              className={`${features.btn} ${features.btnSm}`}
              onClick={() => void showRunning()}
            >
              + Add running app
            </button>
            <button type="button" className={features.btnLink} onClick={() => browse.current?.click()}>
              Browse for .exe
            </button>
            <input
              ref={browse}
              type="file"
              accept=".exe"
              hidden
              aria-label="Choose a program"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const exe = file.name.toLowerCase();
                addApp({ exe, name: appNameFromExe(file.name) });
              }}
            />
            <span className={`${features.small} ${features.dim} ${styles.privacy}`}>
              Only the app name is read. Nothing is injected.
            </span>
          </div>

          {(picker || loading) && (
            <div className={styles.picker} role="listbox" aria-label="Running apps">
              {loading && <div className={styles.pickerNote}>Looking for open programs…</div>}
              {picker && picker.length === 0 && (
                <div className={styles.pickerNote}>No other programs with a window were found.</div>
              )}
              {picker?.map((app) => (
                <button
                  key={app.exe}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className={styles.pickerItem}
                  onClick={() => addApp(app)}
                >
                  <b>{app.name}</b>
                  <span className="mono">{app.exe}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`${features.card} ${styles.fallback}`}>
          <div className={`${features.grow} ${styles.fallbackText}`}>
            Default voice when no listed app is in front
          </div>
          <select
            aria-label="Default voice"
            className={`${features.select} ${styles.fallbackSelect}`}
            value={profiles.fallback ?? ''}
            onChange={(e) => store.getState().setProfileFallback(e.target.value || null)}
          >
            <option value="">Leave the voice as it is</option>
            {voiceNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </section>
      </div>
    </Modal>
  );
}
