export interface Track {
  id: string;
  name: string;
  /** object URL (blob:) of the audio */
  url: string;
}

/** Playlist state machine (no audio element, no DOM): selection, removal, next / previous. */
export class Playlist {
  private tracks: Track[] = [];
  private current = -1;
  private nextId = 1;

  get items(): readonly Track[] {
    return this.tracks;
  }

  get index(): number {
    return this.current;
  }

  get currentTrack(): Track | null {
    return this.tracks[this.current] ?? null;
  }

  get size(): number {
    return this.tracks.length;
  }

  add(name: string, url: string): Track {
    const track: Track = { id: String(this.nextId++), name, url };
    this.tracks.push(track);
    if (this.current < 0) this.current = 0;
    return track;
  }

  select(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    this.current = index;
    return this.tracks[index] ?? null;
  }

  /**
   * Removes a track and keeps the selection sensible.
   * Returns the removed track (so the caller can revoke its URL) and whether the playing track was removed.
   */
  remove(index: number): { removed: Track; wasCurrent: boolean } | null {
    const removed = this.tracks[index];
    if (!removed) return null;
    this.tracks.splice(index, 1);
    const wasCurrent = index === this.current;
    if (wasCurrent) {
      this.current = this.tracks.length ? Math.min(index, this.tracks.length - 1) : -1;
    } else if (index < this.current) {
      this.current -= 1;
    }
    return { removed, wasCurrent };
  }

  clear(): Track[] {
    const old = this.tracks;
    this.tracks = [];
    this.current = -1;
    return old;
  }

  /**
   * Index to play after the current one ends (`auto`) or when the user presses "next".
   * Returns null at the end of the list when looping is off and the change was automatic.
   */
  nextIndex(loop: boolean, auto: boolean): number | null {
    if (this.tracks.length === 0) return null;
    const next = this.current + 1;
    if (next < this.tracks.length) return next;
    if (auto && !loop) return null;
    return 0;
  }

  previousIndex(): number | null {
    if (this.tracks.length === 0) return null;
    return (this.current - 1 + this.tracks.length) % this.tracks.length;
  }
}
