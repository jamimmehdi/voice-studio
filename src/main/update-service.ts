import type { SimpleResult, UpdateInfo } from '@shared/ipc';

/** Minimal surface of electron-updater's `autoUpdater` that the service relies on. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, forceRunAfter?: boolean): void;
}

export interface UpdateSink {
  available(info: UpdateInfo): void;
  none(): void;
  progress(percent: number): void;
  downloaded(): void;
  error(message: string): void;
}

interface RawReleaseNote {
  note?: string | null;
}

/** Turns electron-updater's release notes (HTML string, array or null) into short plain text. */
export function plainReleaseNotes(notes: unknown): string {
  let text = '';
  if (typeof notes === 'string') text = notes;
  else if (Array.isArray(notes)) text = (notes as RawReleaseNote[]).map((n) => n.note ?? '').join('\n');
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 600);
}

const errorText = (e: unknown): string => String(e instanceof Error ? e.message : e).slice(0, 200);
const UNAVAILABLE = 'Updates are only available in the installed app.';

/** Check on launch, download on request, then install silently and relaunch. */
export class UpdateService {
  constructor(
    private readonly updater: AutoUpdaterLike | null,
    sink: UpdateSink,
    restartDelayMs = 1500,
  ) {
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('update-available', ((info: { version: string; releaseNotes?: unknown }) => {
      sink.available({ version: info.version, notes: plainReleaseNotes(info.releaseNotes) });
    }) as never);
    updater.on('update-not-available', (() => sink.none()) as never);
    updater.on('download-progress', ((p: { percent: number }) =>
      sink.progress(Math.round(p.percent))) as never);
    updater.on('update-downloaded', (() => {
      sink.downloaded();
      setTimeout(() => updater.quitAndInstall(true, true), restartDelayMs);
    }) as never);
    updater.on('error', ((e: unknown) => sink.error(errorText(e))) as never);
  }

  get enabled(): boolean {
    return this.updater !== null;
  }

  checkOnLaunch(delayMs = 2500): void {
    if (!this.updater) return;
    setTimeout(() => void this.updater?.checkForUpdates().catch(() => undefined), delayMs);
  }

  async check(): Promise<SimpleResult> {
    if (!this.updater) return { ok: false, error: UNAVAILABLE };
    try {
      await this.updater.checkForUpdates();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }

  async download(): Promise<SimpleResult> {
    if (!this.updater) return { ok: false, error: UNAVAILABLE };
    try {
      await this.updater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }
}
