import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { QuickState } from '@shared/protocols';
import type { Point, Size } from '../geometry';
import type { OverlayWindow } from '../overlay-controller';
import { watchWindow } from '../diag-log';
import { loadRenderer, paths } from '../paths';

export interface OverlayWindowConfig {
  page: 'quick' | 'icon';
  size: Size;
  transparent?: boolean;
}

/**
 * A frameless, always-on-top window that never takes focus, so clicking it cannot minimise a game.
 * Created lazily on first use.
 */
export class ElectronOverlayWindow implements OverlayWindow {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private pending: QuickState | null = null;

  constructor(private readonly config: OverlayWindowConfig) {}

  get size(): Size {
    return this.config.size;
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const { size, transparent } = this.config;
    const win = new BrowserWindow({
      width: size.width,
      height: size.height,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: !transparent,
      transparent: transparent ?? false,
      backgroundColor: transparent ? '#00000000' : '#0a0d12',
      webPreferences: {
        preload: paths.preload('quick'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    // highest level: stays above borderless / windowed-fullscreen games
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.loaded = false;
    win.webContents.once('did-finish-load', () => {
      this.loaded = true;
      if (this.pending) win.webContents.send(IPC.quickState, this.pending);
    });
    watchWindow(this.config.page, win);
    win.on('closed', () => {
      this.win = null;
      this.loaded = false;
    });
    void loadRenderer(win, this.config.page);
    this.win = win;
    return win;
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  showAt(position: Point): void {
    const win = this.ensure();
    win.setPosition(Math.round(position.x), Math.round(position.y));
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  sendState(state: QuickState): void {
    this.pending = state;
    if (this.win && !this.win.isDestroyed() && this.loaded) this.win.webContents.send(IPC.quickState, state);
  }

  position(): Point | null {
    if (!this.win || this.win.isDestroyed()) return null;
    const [x, y] = this.win.getPosition();
    return { x: x ?? 0, y: y ?? 0 };
  }

  moveBy(dx: number, dy: number): void {
    if (!this.win || this.win.isDestroyed()) return;
    const [x, y] = this.win.getPosition();
    this.win.setPosition(Math.round((x ?? 0) + dx), Math.round((y ?? 0) + dy));
  }
}
