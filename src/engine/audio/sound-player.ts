import { Emitter } from './emitter';

export interface SoundEvents {
  /** ids of the clips that are playing right now */
  playing: readonly string[];
}

export interface SoundTarget {
  context: BaseAudioContext;
  /** where clips are connected (the bus's sound input) */
  destination: AudioNode;
}

/**
 * Plays soundboard clips into the music bus. Decoded buffers are cached, several clips can overlap,
 * and starting a clip that is already playing restarts it.
 */
export class SoundPlayer {
  readonly events = new Emitter<SoundEvents>();

  private target: SoundTarget | null = null;
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly active = new Map<string, AudioBufferSourceNode>();

  /** Connects the player to the running engine (or disconnects it with null). */
  attach(target: SoundTarget | null): void {
    if (this.target !== target) this.stopAll();
    this.target = target;
    // buffers decoded for one context can be reused by another, but the cache is cheap to rebuild
    if (!target) this.cache.clear();
  }

  get ready(): boolean {
    return this.target !== null;
  }

  get playing(): readonly string[] {
    return [...this.active.keys()];
  }

  forget(id: string): void {
    this.stop(id);
    this.cache.delete(id);
  }

  /**
   * Plays a clip. `load` is only called when the clip has not been decoded yet.
   * Resolves with the duration in seconds, or null when the engine is not running.
   */
  async play(id: string, load: () => Promise<ArrayBuffer | null>): Promise<number | null> {
    const target = this.target;
    if (!target) return null;

    let buffer = this.cache.get(id);
    if (!buffer) {
      const bytes = await load();
      if (!bytes || this.target !== target) return null;
      buffer = await target.context.decodeAudioData(bytes.slice(0));
      this.cache.set(id, buffer);
    }

    this.stop(id);
    const source = target.context.createBufferSource();
    source.buffer = buffer;
    source.connect(target.destination);
    source.onended = () => {
      if (this.active.get(id) === source) {
        this.active.delete(id);
        this.emit();
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    this.active.set(id, source);
    source.start();
    this.emit();
    return buffer.duration;
  }

  stop(id: string): void {
    const source = this.active.get(id);
    if (!source) return;
    this.active.delete(id);
    try {
      source.stop();
    } catch {
      /* not started */
    }
    this.emit();
  }

  stopAll(): void {
    for (const id of [...this.active.keys()]) this.stop(id);
  }

  private emit(): void {
    this.events.emit('playing', this.playing);
  }
}
