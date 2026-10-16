import { existsSync } from 'node:fs';
import { BrowserWindow, screen, shell } from 'electron';
import { logLine } from '../diag-log';
import { loadRenderer, paths } from '../paths';

const STARTED_MINIMISED_GRACE_MS = 4000;

/**
 * The main studio window. It has no OS title bar (the app's top bar carries themed native window
 * buttons) and "closing" or "minimising" it only hides it: the audio engine keeps running from the tray.
 */
export class StudioWindow {
  readonly browserWindow: BrowserWindow;
  private quitting = false;
  private readonly bornAt = Date.now();
  /** resolves when the page has painted for the first time */
  readonly ready: Promise<void>;

  constructor(private readonly onHidden: () => void) {
    const icon = paths.icon();
    this.browserWindow = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 1200,
      minHeight: 720,
      show: false, // revealed by the launcher once the splash has played
      backgroundColor: '#0a0d12',
      title: 'Voice Studio',
      icon: existsSync(icon) ? icon : undefined,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0d1118', symbolColor: '#aeb8c9', height: 65 },
      webPreferences: {
        preload: paths.preload('studio'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false, // keep audio and timers alive while hidden
      },
    });

    this.browserWindow.setMenuBarVisibility(false);
    // external links open in the default browser, never inside the app window
    this.browserWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });

    this.browserWindow.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.hideToTray();
    });
    this.browserWindow.on('minimize', () => {
      if (this.quitting) return;
      // Windows may create the window minimised when launched from a shortcut or script
      if (Date.now() - this.bornAt < STARTED_MINIMISED_GRACE_MS) {
        this.browserWindow.restore();
        return;
      }
      // Hiding a window that is still minimised leaves it in a state Windows cannot always bring back
      // (it reappears off-screen or stays dead). Restore it first, then hide it as a normal window.
      if (this.browserWindow.isMinimized()) this.browserWindow.restore();
      this.hideToTray();
    });

    this.ready = new Promise((resolve) => this.browserWindow.once('ready-to-show', () => resolve()));
    void loadRenderer(this.browserWindow, 'studio');
  }

  get isAlive(): boolean {
    return !this.browserWindow.isDestroyed();
  }

  /** Called when the app is really quitting, so the close handler stops intercepting. */
  markQuitting(): void {
    this.quitting = true;
  }

  hideToTray(): void {
    if (!this.isAlive) return;
    logLine('studio.hide');
    this.browserWindow.hide();
    this.onHidden();
  }

  show(): void {
    if (!this.isAlive) return;
    const win = this.browserWindow;
    logLine(`studio.show visible=${win.isVisible()} min=${win.isMinimized()} bounds=${JSON.stringify(win.getBounds())}`);
    const wasHidden = !win.isVisible();
    if (win.isMinimized()) win.restore();
    if (!this.isOnScreen()) win.center();
    // A window shown from the tray can stay black until it is resized (the compositor never presents
    // its first frame). Grow it by 1 px while it is still hidden and put the size back right after it
    // appears: one resize, in the same frame as the show, so nothing visibly flickers.
    const size = win.getBounds();
    const nudge = wasHidden && !win.isMaximized() && !win.isFullScreen();
    if (nudge) win.setBounds({ ...size, width: size.width + 1 });
    // Windows refuses to raise a window for a click on a non-focusable overlay (the compact panel):
    // the studio would be "shown" but stay buried behind the game or browser. Briefly making it
    // always-on-top is the reliable way to bring it to the front.
    win.setAlwaysOnTop(true);
    win.show();
    win.moveTop();
    win.focus();
    win.setAlwaysOnTop(false);
    win.webContents.invalidate();
    if (nudge) {
      setTimeout(() => {
        if (!win.isDestroyed() && !win.isMaximized()) win.setBounds(size);
      }, 30);
    }
  }

  /** A window dragged to an unplugged monitor, or parked off-screen by Windows, is unreachable. */
  private isOnScreen(): boolean {
    const b = this.browserWindow.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const visibleW = Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x);
    const visibleH = Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y);
    return visibleW >= 200 && visibleH >= 100;
  }

  send(channel: string, payload?: unknown): void {
    if (this.isAlive) this.browserWindow.webContents.send(channel, payload);
  }
}
