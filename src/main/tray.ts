import { existsSync } from 'node:fs';
import { Menu, Tray, nativeImage } from 'electron';
import { paths } from './paths';

export interface TrayHandlers {
  openStudio(): void;
  togglePanel(): void;
  showPanel(): void;
  showIcon(): void;
  quit(): void;
}

/** System-tray icon with the app menu. */
export class AppTray {
  private readonly tray: Tray;

  constructor(
    private readonly handlers: TrayHandlers,
    private shortcutLabel: string,
  ) {
    const iconPath = paths.icon();
    const image = existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 })
      : nativeImage.createEmpty();
    this.tray = new Tray(image);
    this.tray.setToolTip('Voice Studio');
    this.tray.on('click', handlers.togglePanel);
    this.tray.on('double-click', handlers.openStudio);
    this.refreshMenu();
  }

  setShortcutLabel(label: string): void {
    this.shortcutLabel = label;
    this.refreshMenu();
  }

  /** One-time hint after the window first disappears into the tray. */
  showRunningHint(shortcutLabel: string): void {
    this.tray.displayBalloon({
      iconType: 'info',
      title: 'Voice Studio is still running',
      content: `Your voice keeps being processed. Press ${shortcutLabel} for the compact panel, or use the tray icon.`,
    });
  }

  private refreshMenu(): void {
    const h = this.handlers;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Voice Studio', click: h.openStudio },
        { label: `Compact panel (${this.shortcutLabel})`, click: h.showPanel },
        { label: 'Floating icon', click: h.showIcon },
        { type: 'separator' },
        { label: 'Quit Voice Studio', click: h.quit },
      ]),
    );
  }

  destroy(): void {
    this.tray.destroy();
  }
}
