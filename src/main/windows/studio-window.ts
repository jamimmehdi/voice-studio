import { existsSync } from 'node:fs';
import { BrowserWindow, shell } from 'electron';
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

  constructor(private readonly onHidden: () => void) {
    const icon = paths.icon();
    this.browserWindow = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 1200,
      minHeight: 720,
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
      this.hideToTray();
    });

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
    this.browserWindow.hide();
    this.onHidden();
  }

  show(): void {
    if (!this.isAlive) return;
    if (this.browserWindow.isMinimized()) this.browserWindow.restore();
    this.browserWindow.show();
    this.browserWindow.focus();
  }

  send(channel: string, payload?: unknown): void {
    if (this.isAlive) this.browserWindow.webContents.send(channel, payload);
  }
}
