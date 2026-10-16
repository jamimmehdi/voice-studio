import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, globalShortcut, screen, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { prettyAccelerator } from '@shared/format';
import { IPC } from '@shared/ipc';
import { watchProcess, watchWindow } from './diag-log';
import { ForegroundWatcher, listRunningApps } from './foreground-watcher';
import { HotkeyService } from './hotkey-service';
import { registerIpc } from './ipc';
import { getText } from './net/http';
import { OverlayController } from './overlay-controller';
import { paths } from './paths';
import { CommandRelay } from './relay';
import { RemoteController } from './remote/remote-controller';
import { RemoteServer } from './remote/remote-server';
import { SettingsStore, DEFAULT_SETTINGS, nodeFileIo } from './settings-store';
import { StateBackup } from './state-backup';
import { ShortcutService } from './shortcut-service';
import { SoundStore } from './sound-store';
import { AppTray } from './tray';
import QRCode from 'qrcode';
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
const REMOTE_PORT = 7777;
const COMMUNITY_URL = 'https://jamimmehdi.github.io/voice-studio/community.json';
const COMMUNITY_MAX_CHARS = 512 * 1024;

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

    watchProcess();
    studio = new StudioWindow(() => {
      if (settings.value.trayHintShown) return;
      settings.update({ trayHintShown: true });
      tray?.showRunningHint(prettyAccelerator(shortcut.current ?? settings.value.shortcut));
    });
    const studioWindow = studio;
    watchWindow('studio', studioWindow.browserWindow);

    const relay = new CommandRelay(
      {
        openStudio: () => {
          studioWindow.show();
          overlay.hideAll();
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

    const hotkeys = new HotkeyService(globalShortcut, (cmd) => studioWindow.send(IPC.quickCmd, cmd));
    const foreground = new ForegroundWatcher();
    foreground.onChange((exe) => studioWindow.send(IPC.foregroundChanged, exe));

    const remoteServer = new RemoteServer({
      staticDir: paths.rendererDir(),
      port: REMOTE_PORT,
      token: () => settings.value.remoteToken,
      onCommand: (cmd) => relay.handle(cmd),
      currentState: () => overlay.lastState,
    });
    const remote = new RemoteController({
      settings,
      server: remoteServer,
      qr: (text) =>
        QRCode.toDataURL(text, { margin: 1, width: 300, color: { dark: '#0a0d12', light: '#e8ecf3' } }),
    });
    remoteServer.onDevices((devices) => studioWindow.send(IPC.remoteDevices, devices));
    void remote.init();

    const quit = (): void => {
      studioWindow.markQuitting();
      app.quit();
    };

    tray = new AppTray(
      {
        openStudio: () => {
          studioWindow.show();
          overlay.hideAll();
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
      hotkeys,
      foreground,
      listRunningApps: () => listRunningApps(),
      sounds: new SoundStore(join(app.getPath('userData'), 'sounds')),
      stateBackup: new StateBackup(app.getPath('userData'), nodeFileIo),
      remote,
      remoteServer,
      fetchCommunity: async () => {
        try {
          const text = await Promise.race([
            getText(COMMUNITY_URL),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          return text.slice(0, COMMUNITY_MAX_CHARS);
        } catch {
          return null;
        }
      },
      onShortcutChanged: (label) => tray?.setShortcutLabel(label),
      quit,
    });

    app.on('activate', () => studioWindow.show());
    app.on('before-quit', () => {
      studioWindow.markQuitting();
      splash.destroy();
    });
    app.on('will-quit', () => {
      hotkeys.clear();
      foreground.stop();
      remoteServer.stop();
      shortcut.dispose();
      tray?.destroy();
    });
  });
}
