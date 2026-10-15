import { writeFileSync } from 'node:fs';
import { dialog, ipcMain, Notification, shell } from 'electron';
import { IPC, type AppInfo, type SaveFileFilter, type SettingsView, type ShortcutResult } from '@shared/ipc';
import { prettyAccelerator } from '@shared/format';
import type { RunningApp } from '@shared/features';
import { sanitiseBindings } from './bindings';
import type { QuickState } from '@shared/protocols';
import type { ForegroundWatcher } from './foreground-watcher';
import type { HotkeyService } from './hotkey-service';
import type { RemoteController } from './remote/remote-controller';
import type { RemoteServer } from './remote/remote-server';
import type { SoundStore } from './sound-store';
import type { StateBackup } from './state-backup';
import type { OverlayController } from './overlay-controller';
import type { CommandRelay } from './relay';
import type { SettingsStore } from './settings-store';
import type { ShortcutService } from './shortcut-service';
import type { UpdateService } from './update-service';
import type { VbCableInstaller } from './vbcable/vbcable-installer';
import type { YtDlpService } from './ytdlp/ytdlp-service';

export interface IpcDeps {
  appInfo: AppInfo;
  readWorkletSource(): string;
  ytdlp: YtDlpService;
  vbcable: VbCableInstaller;
  updates: UpdateService;
  shortcut: ShortcutService;
  settings: SettingsStore;
  overlay: OverlayController;
  relay: CommandRelay;
  hotkeys: HotkeyService;
  foreground: ForegroundWatcher;
  listRunningApps(): Promise<RunningApp[]>;
  sounds: SoundStore;
  stateBackup: StateBackup;
  remote: RemoteController;
  remoteServer: Pick<RemoteServer, 'broadcast'>;
  fetchCommunity(): Promise<string | null>;
  onShortcutChanged(label: string): void;
  quit(): void;
}

const EXTERNAL_LINK = /^https:\/\/(github\.com|vb-audio\.com|www\.vb-audio\.com|vb-cable\.com)\//i;

/** Registers every IPC channel in one place. Handlers are thin: the logic lives in the services. */
export function registerIpc(deps: IpcDeps): void {
  const { settings, shortcut, overlay } = deps;

  ipcMain.handle(IPC.appInfo, () => deps.appInfo);
  ipcMain.handle(IPC.dspSource, () => deps.readWorkletSource());
  ipcMain.handle(IPC.ytFetch, (_e, url: string) => deps.ytdlp.fetchAudio(url));
  ipcMain.handle(IPC.vbcableInstall, () => deps.vbcable.install());
  ipcMain.handle(IPC.updateCheck, () => deps.updates.check());
  ipcMain.handle(IPC.updateDownload, () => deps.updates.download());

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (typeof url === 'string' && EXTERNAL_LINK.test(url)) void shell.openExternal(url);
  });

  ipcMain.handle(
    IPC.fileSave,
    async (
      _e,
      args: { name: string; data: ArrayBuffer; filters: SaveFileFilter[] },
    ): Promise<string | null> => {
      const res = await dialog.showSaveDialog({ defaultPath: args.name, filters: args.filters });
      if (res.canceled || !res.filePath) return null;
      writeFileSync(res.filePath, Buffer.from(args.data));
      return res.filePath;
    },
  );

  ipcMain.handle(IPC.settingsGet, (): SettingsView => {
    const accel = settings.value.shortcut;
    return { shortcut: accel, shortcutLabel: prettyAccelerator(accel) };
  });

  ipcMain.handle(IPC.settingsSetShortcut, (_e, accelerator: string): ShortcutResult => {
    const result = shortcut.register(accelerator);
    if (!result.ok) return result;
    settings.update({ shortcut: accelerator });
    const label = prettyAccelerator(accelerator);
    deps.onShortcutChanged(label);
    return { ok: true, shortcutLabel: label };
  });

  ipcMain.handle(IPC.appQuit, () => deps.quit());
  ipcMain.handle(IPC.appCompact, () => {
    overlay.showPanel();
    return true;
  });

  // compact panel / icon -> engine window (or main-process window management)
  ipcMain.on(IPC.quickCmd, (_e, cmd: unknown) => deps.relay.handle(cmd));
  // engine window -> compact panel / icon
  ipcMain.on(IPC.quickState, (_e, state: QuickState) => {
    overlay.pushState(state);
    deps.remoteServer.broadcast(state);
  });

  ipcMain.handle(IPC.notify, (_e, text: unknown) => {
    if (typeof text === 'string' && text.length <= 120 && Notification.isSupported()) {
      new Notification({ title: 'Voice Studio', body: text, silent: true }).show();
    }
  });

  ipcMain.handle(IPC.hotkeysSet, (_e, raw: unknown) => {
    const bindings = sanitiseBindings(raw);
    return deps.hotkeys.apply(bindings, shortcut.current ? [shortcut.current] : []);
  });

  ipcMain.handle(IPC.foregroundActive, (_e, on: unknown) => {
    if (on === true) deps.foreground.start();
    else deps.foreground.stop();
    return deps.foreground.current;
  });
  ipcMain.handle(IPC.appsRunning, () => deps.listRunningApps().catch(() => []));

  ipcMain.handle(IPC.soundsAdd, (_e, args: { name?: unknown; data?: unknown }) => {
    if (!(args?.data instanceof ArrayBuffer) && !ArrayBuffer.isView(args?.data)) throw new Error('No data.');
    const data = args.data as ArrayBuffer | Uint8Array;
    return deps.sounds.add(
      data instanceof ArrayBuffer ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    );
  });
  ipcMain.handle(IPC.soundsRead, (_e, id: unknown) => (typeof id === 'string' ? deps.sounds.read(id) : null));
  ipcMain.handle(IPC.soundsRemove, (_e, id: unknown) => {
    if (typeof id === 'string') deps.sounds.remove(id);
  });

  ipcMain.handle(IPC.remoteGet, () => deps.remote.view());
  ipcMain.handle(IPC.remoteEnable, (_e, on: unknown) => deps.remote.setEnabled(on === true));
  ipcMain.handle(IPC.remoteNewCode, () => deps.remote.newCode());
  ipcMain.handle(IPC.remoteDisconnect, (_e, id: unknown) => {
    if (typeof id === 'string') deps.remote.disconnect(id);
  });

  ipcMain.handle(IPC.communityFetch, () => deps.fetchCommunity());

  ipcMain.on(IPC.stateBackupWrite, (_e, json: unknown) => void deps.stateBackup.write(json));
  ipcMain.handle(IPC.stateBackupRead, () => deps.stateBackup.read());
  // floating icon drag
  ipcMain.on(IPC.iconDrag, (_e, d: { dx: number; dy: number }) => {
    if (d && Number.isFinite(d.dx) && Number.isFinite(d.dy)) overlay.dragIcon(d.dx, d.dy);
  });
  ipcMain.on(IPC.iconDragEnd, () => overlay.rememberIconPosition());
}
