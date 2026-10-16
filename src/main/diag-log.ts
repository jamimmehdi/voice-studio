import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';

const MAX_BYTES = 256 * 1024;

let file: string | null = null;

/** Appends one line to `<userData>/voice-studio.log` (rotated at 256 KB). Never throws. */
export function logLine(text: string): void {
  try {
    file ??= join(app.getPath('userData'), 'voice-studio.log');
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.old`);
    appendFileSync(file, `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* logging must never take the app down */
  }
}

/**
 * Records crashes and hangs of a window's page. A crashed page is reloaded so the window
 * never stays dead; a hung one is only logged (the user may be mid-save).
 */
export function watchWindow(name: string, win: BrowserWindow): void {
  const wc = win.webContents;
  wc.on('render-process-gone', (_e, details) => {
    logLine(`${name}: page process gone (${details.reason}, exit ${details.exitCode})`);
    if (!win.isDestroyed() && details.reason !== 'clean-exit') wc.reload();
  });
  win.on('unresponsive', () => logLine(`${name}: window unresponsive`));
  win.on('responsive', () => logLine(`${name}: window responsive again`));
}

export function watchProcess(): void {
  process.on('uncaughtException', (err) => logLine(`uncaughtException: ${err.stack ?? err.message}`));
  process.on('unhandledRejection', (reason) => logLine(`unhandledRejection: ${String(reason)}`));
}
