import { join } from 'node:path';
import { writeFileSafely, type FileIo } from './settings-store';

/** A studio state is a few kilobytes; anything near this size is not one. */
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export type StateFileIo = FileIo;

const isObject = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Keeps a copy of the studio's state (presets, profiles, hotkeys, parameters) in a file next to the
 * app's other settings. The browser storage the studio normally uses can be wiped or corrupted by
 * the system; this copy lets it come back. Two generations are kept: the file and its `.bak`.
 */
export class StateBackup {
  private readonly path: string;

  constructor(
    dir: string,
    private readonly io: StateFileIo,
  ) {
    this.path = join(dir, 'studio-state.json');
  }

  /** Stores `json` if it is a JSON object of a sane size. Returns whether it was stored. */
  write(json: unknown): boolean {
    if (typeof json !== 'string' || json.length === 0 || json.length > MAX_BACKUP_BYTES) return false;
    try {
      if (!isObject(JSON.parse(json))) return false;
      writeFileSafely(this.io, this.path, json);
      return true;
    } catch {
      return false;
    }
  }

  /** The last good state, falling back to the previous generation when the file is damaged. */
  read(): string | null {
    for (const path of [this.path, `${this.path}.bak`]) {
      try {
        const text = this.io.read(path);
        if (isObject(JSON.parse(text))) return text;
      } catch {
        /* try the next one */
      }
    }
    return null;
  }
}
