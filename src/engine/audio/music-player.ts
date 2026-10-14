import { Emitter } from './emitter';
import { Playlist } from './playlist';

export interface MusicSnapshot {
  hasElement: boolean;
  playing: boolean;
  /** seconds */
  currentTime: number;
  duration: number;
  /** 0..1 */
  progress: number;
  title: string;
  trackCount: number;
  index: number;
}

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|flac|m4a|aac|opus|webm)$/i;

/** True for files the player accepts. */
export function isAudioFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

/** `Artist - Song.mp3` -> `Artist - Song` */
export function trackNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** Maps a ytFetch extension to a playable MIME type. */
export function mimeForExtension(ext: string): string {
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'm4a') return 'audio/mp4';
  return `audio/${ext}`;
}

/**
 * Playlist + transport on top of the engine's music <audio> element.
 * The element only exists while the engine runs (it is created together with the audio context),
 * so `attach` / `detach` are called by the runtime when the engine starts and stops.
 */
export class MusicPlayer {
  readonly playlist = new Playlist();
  readonly events = new Emitter<{ change: undefined }>();
  loop = false;

  private element: HTMLAudioElement | null = null;
  private cleanup: (() => void) | null = null;

  attach(element: HTMLAudioElement): void {
    this.detach();
    this.element = element;
    const notify = (): void => this.events.emit('change', undefined);
    const onEnded = (): void => this.next(true);
    const types = ['timeupdate', 'play', 'pause', 'loadedmetadata'] as const;
    types.forEach((t) => element.addEventListener(t, notify));
    element.addEventListener('ended', onEnded);
    this.cleanup = () => {
      types.forEach((t) => element.removeEventListener(t, notify));
      element.removeEventListener('ended', onEnded);
    };
    const track = this.playlist.currentTrack;
    if (track) element.src = track.url;
    notify();
  }

  detach(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.element = null;
    this.events.emit('change', undefined);
  }

  get snapshot(): MusicSnapshot {
    const el = this.element;
    const duration = el && Number.isFinite(el.duration) ? el.duration : 0;
    const currentTime = el?.currentTime ?? 0;
    return {
      hasElement: el !== null,
      playing: !!el && !el.paused,
      currentTime,
      duration,
      progress: duration > 0 ? currentTime / duration : 0,
      title: this.playlist.currentTrack?.name ?? '',
      trackCount: this.playlist.size,
      index: this.playlist.index,
    };
  }

  addFiles(files: Iterable<File>): number {
    let added = 0;
    for (const file of files) {
      if (!isAudioFile(file)) continue;
      this.playlist.add(trackNameFromFile(file.name), URL.createObjectURL(file));
      added++;
    }
    if (added) this.loadCurrentIfIdle();
    this.events.emit('change', undefined);
    return added;
  }

  addBuffer(name: string, data: ArrayBuffer, mime: string): void {
    this.playlist.add(name, URL.createObjectURL(new Blob([data], { type: mime })));
    this.loadCurrentIfIdle();
    this.events.emit('change', undefined);
  }

  select(index: number, play: boolean): void {
    const track = this.playlist.select(index);
    if (!track) return;
    if (this.element) {
      this.element.src = track.url;
      if (play) void this.element.play().catch(() => undefined);
    }
    this.events.emit('change', undefined);
  }

  /** Play / pause. Returns false when the engine (and so the element) is not running. */
  toggle(): boolean {
    const el = this.element;
    if (!el || !this.playlist.currentTrack) return false;
    if (!el.src) el.src = this.playlist.currentTrack.url;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
    return true;
  }

  pause(): void {
    if (this.element && !this.element.paused) this.element.pause();
  }

  next(auto = false): void {
    const idx = this.playlist.nextIndex(this.loop, auto);
    if (idx === null) {
      this.events.emit('change', undefined);
      return;
    }
    this.select(idx, true);
  }

  previous(): void {
    const el = this.element;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    const idx = this.playlist.previousIndex();
    if (idx !== null) this.select(idx, true);
  }

  /** @param fraction 0..1 */
  seek(fraction: number): void {
    const el = this.element;
    if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(1, fraction)) * el.duration;
  }

  remove(index: number): void {
    const result = this.playlist.remove(index);
    if (!result) return;
    URL.revokeObjectURL(result.removed.url);
    if (result.wasCurrent && this.element) {
      this.element.pause();
      const track = this.playlist.currentTrack;
      if (track) this.element.src = track.url;
      else this.element.removeAttribute('src');
    }
    this.events.emit('change', undefined);
  }

  clear(): void {
    this.playlist.clear().forEach((t) => URL.revokeObjectURL(t.url));
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
    }
    this.events.emit('change', undefined);
  }

  private loadCurrentIfIdle(): void {
    const track = this.playlist.currentTrack;
    if (this.element && track && !this.element.src) this.element.src = track.url;
  }
}
