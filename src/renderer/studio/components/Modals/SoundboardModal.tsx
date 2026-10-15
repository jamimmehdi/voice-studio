import { useRef, useState } from 'react';
import { BUILTIN_PRESETS, VOICE_TILES } from '@shared/presets';
import { BarSlider } from '../../../ui/BarSlider';
import { Modal } from '../../../ui/Modal';
import { Switch } from '../../../ui/Switch';
import { useRuntime, useStudio } from '../../runtime/react';
import { AcceleratorButton } from '../Features/AcceleratorButton';
import features from '../Features/features.module.css';
import styles from './SoundboardModal.module.css';

const MAX_CLIPS = 24;

/** Soundboard pads plus global hotkeys for voices. */
export function SoundboardModal(): React.ReactElement {
  const { sounds: controller } = useRuntime();
  const {
    sounds,
    options,
    hotkeys,
    playing,
    engineRunning,
    userPresets,
    setModal,
    setSoundKey,
    setVoiceKey,
    setQuickKey,
    setHotkeyToast,
    setSoundOptions,
  } = useStudio((s) => ({
    sounds: s.sounds,
    options: s.soundOptions,
    hotkeys: s.hotkeys,
    playing: s.playingSounds,
    engineRunning: s.engine === 'running',
    userPresets: s.userPresets,
    setModal: s.setModal,
    setSoundKey: s.setSoundKey,
    setVoiceKey: s.setVoiceKey,
    setQuickKey: s.setQuickKey,
    setHotkeyToast: s.setHotkeyToast,
    setSoundOptions: s.setSoundOptions,
  }));
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (list: FileList | File[]): Promise<void> => {
    const files = [...list].filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name),
    );
    if (files.length === 0) {
      setMessage('Choose an audio file (mp3, wav, ogg, m4a).');
      return;
    }
    setMessage(null);
    for (const file of files) {
      if (sounds.length >= MAX_CLIPS) {
        setMessage(`The board holds ${MAX_CLIPS} sounds.`);
        break;
      }
      try {
        await controller.addFile(file.name, await file.arrayBuffer());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'That file could not be added.');
      }
    }
  };

  const voiceOptions = [
    ...VOICE_TILES.filter((t) => t.key in BUILTIN_PRESETS).map((t) => ({ key: t.key, label: t.label })),
    ...Object.keys(userPresets).map((name) => ({ key: name, label: name })),
  ];

  return (
    <Modal title="Soundboard and hotkeys" onClose={() => setModal(null)} width={1040} tone="page">
      <div className={styles.layout}>
        <section
          className={`${features.card} ${dragging ? styles.drop : ''}`}
          aria-label="Soundboard"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          <div className={features.head}>
            <h3 className={`${features.eyebrow} ${features.grow}`}>Soundboard</h3>
            <span className={features.small}>Volume</span>
            <div className={styles.volume}>
              <BarSlider
                label="Soundboard volume"
                min={0}
                max={100}
                value={options.volume}
                defaultValue={70}
                onChange={(v) => setSoundOptions({ volume: v })}
              />
            </div>
            <button
              type="button"
              className={`${features.btn} ${features.btnSm}`}
              onClick={() => fileInput.current?.click()}
            >
              + Add sound
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              multiple
              hidden
              aria-label="Add sound files"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className={styles.pads}>
            {sounds.map((sound) => {
              const isPlaying = playing.includes(sound.id);
              return (
                <div key={sound.id} className={`${styles.pad} ${isPlaying ? styles.padOn : ''}`}>
                  <button
                    type="button"
                    className={styles.padMain}
                    disabled={!engineRunning}
                    title={engineRunning ? 'Play' : 'Start the engine to play sounds'}
                    onClick={() => void controller.play(sound.id)}
                  >
                    <span className={styles.padTop}>
                      <span className={`${features.dot} ${isPlaying ? styles.live : styles.idle}`} />
                    </span>
                    <span className={styles.padName}>{sound.name}</span>
                  </button>
                  <div className={styles.padKey}>
                    <AcceleratorButton
                      ariaLabel={`Hotkey for ${sound.name}`}
                      value={hotkeys.sounds[sound.id] ?? null}
                      onChange={(a) => setSoundKey(sound.id, a)}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove ${sound.name}`}
                    onClick={() => void controller.remove(sound.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className={styles.addPad}
              aria-label="Add sound"
              onClick={() => fileInput.current?.click()}
            >
              +
            </button>
          </div>

          <div className={features.switchRow}>
            <span className={features.grow}>Lower my voice effect while a sound plays</span>
            <Switch
              label="Lower my voice while a sound plays"
              checked={options.duckVoice}
              onChange={(v) => setSoundOptions({ duckVoice: v })}
            />
          </div>
          <div className={`${features.small} ${features.dim} ${styles.hint}`}>
            {message ? (
              <span className={features.errorText}>{message}</span>
            ) : (
              'Sounds play through your mic path, so teammates hear them. Drag a file here to add it.'
            )}
          </div>
        </section>

        <section className={features.card} aria-label="Voice hotkeys">
          <h3 className={features.eyebrow}>Voice hotkeys</h3>
          <p className={features.lead}>Jump to a voice without opening anything. Works in games.</p>
          <div className={styles.voiceList}>
            {VOICE_TILES.filter(
              (t) => t.key in BUILTIN_PRESETS && t.key !== 'Clean mic (no voice change)',
            ).map((tile) => (
              <div className={features.item} key={tile.key}>
                <span className={features.dot} style={{ background: tile.color }} />
                <span className={features.itemName}>{tile.label}</span>
                <AcceleratorButton
                  ariaLabel={`Hotkey for ${tile.label}`}
                  emptyLabel="Not set"
                  value={hotkeys.voices[tile.key] ?? null}
                  onChange={(a) => setVoiceKey(tile.key, a)}
                />
              </div>
            ))}
          </div>

          <div className={styles.quick}>
            <div className={`${features.small} ${styles.quickHead}`}>Quick switch</div>
            <div className={features.item}>
              <span className={features.itemName}>Press once, press again to go back</span>
              <AcceleratorButton
                ariaLabel="Quick switch key"
                value={hotkeys.quick.accelerator}
                onChange={(a) => setQuickKey({ accelerator: a })}
              />
            </div>
            <label className={styles.quickPick}>
              <span className={features.small}>Voice</span>
              <select
                className={features.select}
                value={hotkeys.quick.preset ?? ''}
                onChange={(e) => setQuickKey({ preset: e.target.value || null })}
              >
                <option value="">Choose a voice…</option>
                {voiceOptions.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={`${features.switchRow} ${styles.toast}`}>
            <span className={features.grow}>Show a toast when the voice changes</span>
            <Switch label="Show a toast" checked={hotkeys.toast} onChange={setHotkeyToast} />
          </div>
        </section>
      </div>
    </Modal>
  );
}
