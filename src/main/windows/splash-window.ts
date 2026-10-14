import { BrowserWindow } from 'electron';
import { loadRenderer } from '../paths';
import { remainingSplashTime, SPLASH_FADE_MS } from '../splash-timing';

const WIDTH = 520;
const HEIGHT = 340;

/**
 * Animated launch screen. It is a small frameless, transparent window that appears immediately,
 * stays up for a minimum time and fades out when the studio window is ready.
 */
export class SplashWindow {
  private win: BrowserWindow | null;
  private shownAt = Date.now();

  constructor(version: string) {
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      center: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.win.once('ready-to-show', () => {
      this.shownAt = Date.now();
      this.win?.showInactive();
    });
    this.win.on('closed', () => {
      this.win = null;
    });
    void loadRenderer(this.win, 'splash', { v: version });
  }

  /**
   * Waits until the splash has been visible for its minimum time, calls `onFadeStart` (the studio
   * window appears underneath), plays the fade-out and closes. Resolves once the window is gone.
   */
  async dismiss(onFadeStart?: () => void): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const wait = remainingSplashTime(this.shownAt, Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    onFadeStart?.();
    if (win.isDestroyed()) return;
    try {
      await win.webContents.executeJavaScript("document.body.classList.add('leaving')");
    } catch {
      /* the page may already be gone */
    }
    await new Promise((r) => setTimeout(r, SPLASH_FADE_MS));
    if (!win.isDestroyed()) win.close();
  }

  /** Closes immediately (used when quitting during start-up). */
  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}
