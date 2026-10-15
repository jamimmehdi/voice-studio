import { useEffect, useRef, useState } from 'react';
import { signed } from '@shared/format';
import type { StudioParams } from '@shared/params';
import { BUILTIN_PRESETS, VOICE_TILES } from '@shared/presets';
import { applyBuiltinPreset } from '@shared/presets';
import { createDefaultParams } from '@shared/params';
import { exportVsp, parseCommunity, parseVsp, type CommunityVoice } from '@shared/vsp';
import { useRuntime, useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import styles from './VoiceLibrary.module.css';

type Tab = 'mine' | 'builtin' | 'community';

const COLORS = ['#ff6fb5', '#6aa5ff', '#e9d758', '#8b7cff', '#ffb86b', '#5eead4'];

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

const caption = (p: StudioParams): string => `${signed(p.voice.pitch)} st · ${signed(p.voice.formant)} st`;

const fileName = (name: string): string => `${name.replace(/[^\w .-]+/g, '').trim() || 'voice'}.vsp`;

/** Import / export / share voices, plus the built-in and community lists. */
export function VoiceLibrary(): React.ReactElement {
  const { api } = useRuntime();
  const { userPresets, applyPreset, importVoices, deleteUserPreset } = useStudio((s) => ({
    userPresets: s.userPresets,
    applyPreset: s.applyPreset,
    importVoices: s.importVoices,
    deleteUserPreset: s.deleteUserPreset,
  }));
  const store = useRuntime().store;
  const [tab, setTab] = useState<Tab>('mine');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [community, setCommunity] = useState<CommunityVoice[] | null>(null);
  const [communityFailed, setCommunityFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'community' || community) return;
    let alive = true;
    void api.communityVoices().then((text) => {
      if (!alive) return;
      const voices = text ? parseCommunity(text) : [];
      setCommunityFailed(text === null || voices.length === 0);
      setCommunity(voices);
    });
    return () => {
      alive = false;
    };
  }, [tab, community, api]);

  const importText = (text: string): void => {
    const parsed = parseVsp(text);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    const map: Record<string, StudioParams> = {};
    for (const v of parsed.voices) map[v.name] = v.params;
    importVoices(map);
    setFresh(new Set(Object.keys(map)));
    setTab('mine');
    setMessage(`Imported ${parsed.voices.length} voice${parsed.voices.length === 1 ? '' : 's'}.`);
  };

  const importFiles = async (files: FileList | File[]): Promise<void> => {
    for (const file of [...files].slice(0, 5)) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage('That file is too large to be a voice.');
        continue;
      }
      importText(await file.text());
    }
  };

  const save = async (name: string, voices: Record<string, StudioParams>): Promise<void> => {
    const data = new TextEncoder().encode(exportVsp(voices));
    const where = await api.saveFile(name, data.buffer as ArrayBuffer, [
      { name: 'Voice Studio voice', extensions: ['vsp'] },
    ]);
    setMessage(where ? 'Saved.' : null);
  };

  const mine = Object.entries(userPresets);

  return (
    <section
      className={`${features.card} ${styles.card} ${dragging ? styles.drop : ''}`}
      aria-label="Voice library"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      <div className={features.head}>
        <h3 className={`${features.eyebrow} ${features.grow}`}>Voice library</h3>
        <button
          type="button"
          className={`${features.btn} ${features.btnSm}`}
          onClick={() => input.current?.click()}
        >
          Import file
        </button>
        <button
          type="button"
          className={`${features.btn} ${features.btnSm} ${features.btnPrimary}`}
          disabled={mine.length === 0}
          onClick={() => void save('voice-studio-voices.vsp', userPresets)}
        >
          Export all
        </button>
        <input
          ref={input}
          type="file"
          accept=".vsp,application/json"
          multiple
          hidden
          aria-label="Import voice files"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className={features.chipRow} role="tablist" aria-label="Voice sources">
        {(
          [
            ['mine', 'Mine'],
            ['builtin', 'Built-in'],
            ['community', 'Community'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${features.chip} ${tab === id ? features.chipOn : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {tab === 'mine' && mine.length === 0 && (
          <div className={styles.note}>
            You have no saved voices yet. Save one from the Preset menu, or import a .vsp file.
          </div>
        )}
        {tab === 'mine' &&
          mine.map(([name, params]) => {
            const isNew = fresh.has(name);
            return (
              <div className={`${styles.item} ${isNew ? styles.itemNew : ''}`} key={name}>
                <span className={features.dot} style={{ background: colorFor(name) }} />
                <button type="button" className={styles.itemMain} onClick={() => applyPreset(name)}>
                  <b>{name}</b>
                  <span className="mono">
                    {caption(params)} · {isNew ? 'imported' : 'by you'}
                  </span>
                </button>
                {isNew && <span className={features.badge}>New</span>}
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm}`}
                  onClick={() => void save(fileName(name), { [name]: params })}
                >
                  Share
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Delete ${name}`}
                  onClick={() => deleteUserPreset(name)}
                >
                  ×
                </button>
              </div>
            );
          })}

        {tab === 'builtin' &&
          VOICE_TILES.filter((t) => t.key in BUILTIN_PRESETS).map((tile) => {
            const p = applyBuiltinPreset(createDefaultParams(), tile.key);
            return (
              <div className={styles.item} key={tile.key}>
                <span className={features.dot} style={{ background: tile.color }} />
                <button type="button" className={styles.itemMain} onClick={() => applyPreset(tile.key)}>
                  <b>{tile.label}</b>
                  <span className="mono">{p ? caption(p) : ''}</span>
                </button>
                <button
                  type="button"
                  className={`${features.btn} ${features.btnSm}`}
                  onClick={() => applyPreset(tile.key)}
                >
                  Use
                </button>
              </div>
            );
          })}

        {tab === 'community' && community === null && <div className={styles.note}>Loading voices…</div>}
        {tab === 'community' && community !== null && communityFailed && (
          <div className={styles.note}>
            The community list could not be loaded. Check your connection and open this tab again.
          </div>
        )}
        {tab === 'community' &&
          community?.map((voice) => (
            <div className={styles.item} key={voice.name}>
              <span className={features.dot} style={{ background: colorFor(voice.name) }} />
              <div className={styles.itemMain}>
                <b>{voice.name}</b>
                <span className="mono">
                  {caption(voice.params)} · by {voice.author}
                </span>
                {voice.description && <span className={styles.desc}>{voice.description}</span>}
              </div>
              <button
                type="button"
                className={`${features.btn} ${features.btnSm}`}
                disabled={voice.name in userPresets}
                onClick={() => {
                  importVoices({ [voice.name]: voice.params });
                  setFresh(new Set([voice.name]));
                  setMessage(`Added ${voice.name} to your voices.`);
                  store.getState().applyPreset(voice.name);
                }}
              >
                {voice.name in userPresets ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
      </div>

      <div className={styles.dropzone}>
        {message ?? (
          <>
            Drop a <span className="mono">.vsp</span> voice file here to import it
          </>
        )}
      </div>
    </section>
  );
}
