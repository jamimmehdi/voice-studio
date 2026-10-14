import { readFileSync, writeFileSync } from 'node:fs';
import type { Point } from './geometry';

export interface AppSettings {
  /** Electron accelerator that shows / shrinks the compact panel */
  shortcut: string;
  panelPosition: Point | null;
  iconPosition: Point | null;
  /** the "still running in the tray" balloon is shown once */
  trayHintShown: boolean;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  shortcut: 'Control+Alt+V',
  panelPosition: null,
  iconPosition: null,
  trayHintShown: false,
};

export interface FileIo {
  read(path: string): string;
  write(path: string, data: string): void;
}

const nodeFileIo: FileIo = {
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, d) => writeFileSync(p, d),
};

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
      this.io.write(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      /* a read-only profile must not crash the app */
    }
  }

  private load(): AppSettings {
    try {
      const raw: unknown = JSON.parse(this.io.read(this.filePath));
      if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
      const r = raw as Record<string, unknown>;
      return {
        shortcut: typeof r.shortcut === 'string' && r.shortcut ? r.shortcut : DEFAULT_SETTINGS.shortcut,
        panelPosition: isPoint(r.panelPosition) ? { x: r.panelPosition.x, y: r.panelPosition.y } : null,
        iconPosition: isPoint(r.iconPosition) ? { x: r.iconPosition.x, y: r.iconPosition.y } : null,
        trayHintShown: r.trayHintShown === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
