import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Point } from './geometry';

export interface AppSettings {
  /** Electron accelerator that shows / shrinks the compact panel */
  shortcut: string;
  panelPosition: Point | null;
  iconPosition: Point | null;
  /** the "still running in the tray" balloon is shown once */
  trayHintShown: boolean;
  /** the phone remote is switched on */
  remoteEnabled: boolean;
  /** pairing token of the phone remote */
  remoteToken: string;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  shortcut: 'Control+Alt+V',
  panelPosition: null,
  iconPosition: null,
  trayHintShown: false,
  remoteEnabled: false,
  remoteToken: '',
};

export interface FileIo {
  read(path: string): string;
  write(path: string, data: string): void;
  /** atomically replaces `to` with `from` (optional: without it the file is written in place) */
  rename?(from: string, to: string): void;
}

export const nodeFileIo: FileIo = {
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, d) => writeFileSync(p, d),
  rename: (a, b) => renameSync(a, b),
};

/** Writes `data` so that a crash half way never leaves a truncated file, and keeps the last good copy. */
export function writeFileSafely(io: FileIo, path: string, data: string): void {
  try {
    const previous = io.read(path);
    JSON.parse(previous);
    io.write(`${path}.bak`, previous);
  } catch {
    /* nothing valid to keep yet */
  }
  if (io.rename) {
    const tmp = `${path}.tmp`;
    io.write(tmp, data);
    io.rename(tmp, path);
  } else {
    io.write(path, data);
  }
}

const isPoint = (v: unknown): v is Point =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Point).x) && Number.isFinite((v as Point).y);

/** Persists the small set of app-level settings as JSON. Tolerates a missing or corrupt file. */
export class SettingsStore {
  private data: AppSettings;

  constructor(
    private readonly filePath: string,
    private readonly io: FileIo = nodeFileIo,
  ) {
    this.data = this.load();
  }

  get value(): Readonly<AppSettings> {
    return this.data;
  }

  update(patch: Partial<AppSettings>): void {
    this.data = { ...this.data, ...patch };
    try {
      writeFileSafely(this.io, this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      /* a read-only profile must not crash the app */
    }
  }

  /** The settings file, or its backup when the file is missing or damaged. */
  private load(): AppSettings {
    for (const path of [this.filePath, `${this.filePath}.bak`]) {
      const loaded = this.tryLoad(path);
      if (loaded) return loaded;
    }
    return { ...DEFAULT_SETTINGS };
  }

  private tryLoad(path: string): AppSettings | null {
    try {
      const raw: unknown = JSON.parse(this.io.read(path));
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      return {
        shortcut: typeof r.shortcut === 'string' && r.shortcut ? r.shortcut : DEFAULT_SETTINGS.shortcut,
        panelPosition: isPoint(r.panelPosition) ? { x: r.panelPosition.x, y: r.panelPosition.y } : null,
        iconPosition: isPoint(r.iconPosition) ? { x: r.iconPosition.x, y: r.iconPosition.y } : null,
        trayHintShown: r.trayHintShown === true,
        remoteEnabled: r.remoteEnabled === true,
        remoteToken: typeof r.remoteToken === 'string' ? r.remoteToken.slice(0, 64) : '',
      };
    } catch {
      return null;
    }
  }
}
