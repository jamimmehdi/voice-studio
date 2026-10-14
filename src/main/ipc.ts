import { writeFileSync } from 'node:fs';
import { dialog, ipcMain, shell } from 'electron';
import { IPC, type AppInfo, type SaveFileFilter, type SettingsView, type ShortcutResult } from '@shared/ipc';
import { prettyAccelerator } from '@shared/format';
import type { QuickState } from '@shared/protocols';
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
    async (_e, args: { name: string; data: ArrayBuffer; filters: SaveFileFilter[] }): Promise<string | null> => {
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
  ipcMain.on(IPC.quickState, (_e, state: QuickState) => overlay.pushState(state));
  // floating icon drag
  ipcMain.on(IPC.iconDrag, (_e, d: { dx: number; dy: number }) => {
    if (d && Number.isFinite(d.dx) && Number.isFinite(d.dy)) overlay.dragIcon(d.dx, d.dy);
  });
  ipcMain.on(IPC.iconDragEnd, () => overlay.rememberIconPosition());
}
