import type { AudioEngine } from '@engine/audio/audio-engine';
import type { SoundPlayer } from '@engine/audio/sound-player';
import type { SoundEntry } from '@shared/features';
import type { StudioApi } from '@shared/ipc';
import type { StudioStoreApi } from '../store/studio-store';

type EnginePort = Pick<AudioEngine, 'events' | 'context' | 'musicBus' | 'setVoiceLevel'>;
type PlayerPort = Pick<SoundPlayer, 'attach' | 'play' | 'stop' | 'stopAll' | 'forget' | 'events' | 'playing'>;

export interface SoundControllerDeps {
  store: StudioStoreApi;
  engine: EnginePort;
  player: PlayerPort;
  api: Pick<StudioApi, 'sounds'>;
}

/** Voice level while a clip plays (the clip should be understood over your voice). */
export const DUCKED_VOICE_LEVEL = 0.3;

/** Level of the voice path: muted wins, then the "lower my voice" option while a clip plays. */
export function voiceLevel(muted: boolean, playing: boolean, duckVoice: boolean): number {
  if (muted) return 0;
  return playing && duckVoice ? DUCKED_VOICE_LEVEL : 1;
}

/** "airhorn.mp3" -> "airhorn" (the label on the pad). */
export function cleanName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return (base || 'Sound').slice(0, 40);
}

/**
 * The soundboard: keeps the clip files (through the main process), plays them into the engine's
 * sound input and lowers the voice while one plays.
 */
export class SoundController {
  constructor(private readonly deps: SoundControllerDeps) {}

  wire(): () => void {
    const { engine, player, store } = this.deps;
    const disposers: Array<() => void> = [];

    const attach = (): void => {
      const ctx = engine.context;
      const bus = engine.musicBus;
      if (ctx && bus) {
        bus.setSoundVolume(store.getState().soundOptions.volume / 100);
        player.attach({ context: ctx, destination: bus.soundInput });
      } else {
        player.attach(null);
      }
      this.applyVoiceLevel();
    };
    disposers.push(engine.events.on('musicBus', attach));

    disposers.push(
      player.events.on('playing', (ids) => {
        store.getState().setPlayingSounds([...ids]);
        this.applyVoiceLevel();
      }),
    );

    let last = store.getState();
    disposers.push(
      store.subscribe((s) => {
        if (s.soundOptions.volume !== last.soundOptions.volume) {
          engine.musicBus?.setSoundVolume(s.soundOptions.volume / 100);
        }
        if (
          s.muted !== last.muted ||
          s.soundOptions.duckVoice !== last.soundOptions.duckVoice ||
          s.playingSounds !== last.playingSounds
        ) {
          this.applyVoiceLevel();
        }
        last = s;
      }),
    );
    return () => disposers.forEach((d) => d());
  }

  applyVoiceLevel(): void {
    const s = this.deps.store.getState();
    this.deps.engine.setVoiceLevel(voiceLevel(s.muted, s.playingSounds.length > 0, s.soundOptions.duckVoice));
  }

  /** Stores a clip and adds it to the board. */
  async addFile(name: string, data: ArrayBuffer): Promise<SoundEntry> {
    const id = await this.deps.api.sounds.add(name, data);
    const entry: SoundEntry = { id, name: cleanName(name) };
    this.deps.store.getState().addSound(entry);
    return entry;
  }

  async play(id: string): Promise<boolean> {
    if (!this.deps.store.getState().sounds.some((s) => s.id === id)) return false;
    const duration = await this.deps.player.play(id, () => this.deps.api.sounds.read(id));
    return duration !== null;
  }

  async remove(id: string): Promise<void> {
    this.deps.player.forget(id);
    this.deps.store.getState().removeSound(id);
    await this.deps.api.sounds.remove(id);
  }

  stopAll(): void {
    this.deps.player.stopAll();
  }
}
