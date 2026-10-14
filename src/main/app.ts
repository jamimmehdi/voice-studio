import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, globalShortcut, screen, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { prettyAccelerator } from '@shared/format';
import { IPC } from '@shared/ipc';
import { registerIpc } from './ipc';
import { OverlayController } from './overlay-controller';
import { paths } from './paths';
import { CommandRelay } from './relay';
import { SettingsStore, DEFAULT_SETTINGS } from './settings-store';
import { ShortcutService } from './shortcut-service';
import { AppTray } from './tray';
import { UpdateService, type AutoUpdaterLike } from './update-service';
import { VbCableInstaller } from './vbcable/vbcable-installer';
import { ElectronOverlayWindow } from './windows/overlay-window';
import { SplashWindow } from './windows/splash-window';
import { StudioWindow } from './windows/studio-window';
import { YtDlpService } from './ytdlp/ytdlp-service';

const APP_USER_MODEL_ID = 'com.voicestudio.app';
const PANEL_SIZE = { width: 440, height: 720 };
const ICON_SIZE = { width: 64, height: 64 };
/** if the studio page never paints, show it anyway after this long */
const STARTUP_TIMEOUT_MS = 15_000;

/** Composition root of the main process: builds the services and wires them together. */
export function startApp(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID);

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let studio: StudioWindow | null = null;
  app.on('second-instance', () => studio?.show());

  void app.whenReady().then(() => {
    // only microphone access and output-device selection are ever needed
    const allowed = new Set(['media', 'speaker-selection']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

    const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));

    const panel = new ElectronOverlayWindow({ page: 'quick', size: PANEL_SIZE });
    const icon = new ElectronOverlayWindow({ page: 'icon', size: ICON_SIZE, transparent: true });
    const overlay = new OverlayController({
      panel,
      icon,
      settings,
      workArea: () => screen.getPrimaryDisplay().workArea,
    });

    let tray: AppTray | null = null;

    // the launch screen is up before anything heavy is created
    const splash = new SplashWindow(app.getVersion());

    studio = new StudioWindow(() => {
      if (settings.value.trayHintShown) return;
      settings.update({ trayHintShown: true });
      tray?.showRunningHint(prettyAccelerator(shortcut.current ?? settings.value.shortcut));
    });
    const studioWindow = studio;

    const relay = new CommandRelay(
      {
        openStudio: () => {
          overlay.hideAll();
          studioWindow.show();
        },
        showIcon: () => overlay.showIcon(),
        hidePanel: () => overlay.hidePanel(),
        showPanel: () => overlay.showPanel(),
      },
      { send: (cmd) => studioWindow.send(IPC.quickCmd, cmd) },
    );

    const shortcut = new ShortcutService(globalShortcut, () => overlay.toggle());
    if (!shortcut.register(settings.value.shortcut).ok) {
      settings.update({ shortcut: DEFAULT_SETTINGS.shortcut });
      shortcut.register(DEFAULT_SETTINGS.shortcut);
    }

    const quit = (): void => {
      studioWindow.markQuitting();
      app.quit();
    };

    tray = new AppTray(
      {
        openStudio: () => {
          overlay.hideAll();
          studioWindow.show();
        },
        togglePanel: () => overlay.toggle(),
        showPanel: () => overlay.showPanel(),
        showIcon: () => overlay.showIcon(),
        quit,
      },
      prettyAccelerator(settings.value.shortcut),
    );

    const updates = new UpdateService(app.isPackaged ? (autoUpdater as unknown as AutoUpdaterLike) : null, {
      available: (info) => studioWindow.send(IPC.updateAvailable, info),
      none: () => studioWindow.send(IPC.updateNone),
      progress: (percent) => studioWindow.send(IPC.updateProgress, { percent }),
      downloaded: () => studioWindow.send(IPC.updateDownloaded),
      error: (message) => studioWindow.send(IPC.updateError, message),
    });
    studioWindow.browserWindow.webContents.once('did-finish-load', () => updates.checkOnLaunch());

    // reveal the studio underneath as the splash fades out (never wait longer than the safety timeout)
    const safety = new Promise<void>((resolve) => setTimeout(resolve, STARTUP_TIMEOUT_MS));
    void Promise.race([studioWindow.ready, safety]).then(() => splash.dismiss(() => studioWindow.show()));

    registerIpc({
      appInfo: { version: app.getVersion(), packaged: app.isPackaged, author: 'Jamim Mehdi' },
      readWorkletSource: () => readFileSync(paths.worklet(), 'utf8'),
      ytdlp: new YtDlpService({ dataDir: app.getPath('userData'), jsRuntimePath: process.execPath }),
      vbcable: new VbCableInstaller(),
      updates,
      shortcut,
      settings,
      overlay,
      relay,
      onShortcutChanged: (label) => tray?.setShortcutLabel(label),
      quit,
    });

    app.on('activate', () => studioWindow.show());
    app.on('before-quit', () => {
      studioWindow.markQuitting();
      splash.destroy();
    });
    app.on('will-quit', () => {
      shortcut.dispose();
      tray?.destroy();
    });
  });
}
