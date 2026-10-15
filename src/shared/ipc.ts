import type { HotkeyBindings, HotkeyResult, RunningApp } from './features';
import type { QuickCommand, QuickState } from './protocols';

/** Every IPC channel name in one place. */
export const IPC = {
  appInfo: 'app:info',
  dspSource: 'dsp:source',
  ytFetch: 'yt:fetch',
  fileSave: 'file:save',
  vbcableInstall: 'vbcable:install',
  openExternal: 'open:external',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  settingsGet: 'settings:get',
  settingsSetShortcut: 'settings:setShortcut',
  appQuit: 'app:quit',
  appCompact: 'app:compact',
  notify: 'app:notify',
  hotkeysSet: 'hotkeys:set',
  foregroundActive: 'foreground:active',
  foregroundChanged: 'foreground:changed',
  appsRunning: 'apps:running',
  soundsAdd: 'sounds:add',
  soundsRead: 'sounds:read',
  soundsRemove: 'sounds:remove',
  remoteGet: 'remote:get',
  remoteEnable: 'remote:enable',
  remoteNewCode: 'remote:newCode',
  remoteDisconnect: 'remote:disconnect',
  remoteDevices: 'remote:devices',
  communityFetch: 'library:community',
  // events main -> renderer
  updateAvailable: 'update:available',
  updateNone: 'update:none',
  updateProgress: 'update:progress',
  updateDownloaded: 'update:downloaded',
  updateError: 'update:error',
  // relay between the engine window and the compact panel / icon
  quickCmd: 'quick:cmd',
  quickState: 'quick:state',
  iconDrag: 'icon:drag',
  iconDragEnd: 'icon:dragEnd',
} as const;

export interface AppInfo {
  version: string;
  packaged: boolean;
  author: string;
}

export type YtFetchResult =
  { ok: true; title: string; ext: string; data: ArrayBuffer } | { ok: false; error: string };

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface SettingsView {
  shortcut: string;
  shortcutLabel: string;
}

export type ShortcutResult = { ok: true; shortcutLabel: string } | { ok: false; error: string };

export interface SaveFileFilter {
  name: string;
  extensions: string[];
}

export interface UpdateInfo {
  version: string;
  notes: string;
}

export type Unsubscribe = () => void;

export interface RemoteDevice {
  id: string;
  name: string;
  /** ms since epoch */
  since: number;
}

export interface RemoteView {
  enabled: boolean;
  /** address to open on the phone, or null while the server is off / has no network */
  url: string | null;
  /** the same address as a QR code (data URL) */
  qr: string | null;
  devices: RemoteDevice[];
  error: string | null;
}

/** API exposed to the studio window through contextBridge. */
export interface StudioApi {
  appInfo(): Promise<AppInfo>;
  dspSource(): Promise<string>;
  ytFetch(url: string): Promise<YtFetchResult>;
  saveFile(name: string, data: ArrayBuffer, filters: SaveFileFilter[]): Promise<string | null>;
  installVbCable(): Promise<SimpleResult>;
  openExternal(url: string): Promise<void>;
  settings: {
    get(): Promise<SettingsView>;
    setShortcut(accelerator: string): Promise<ShortcutResult>;
  };
  quitApp(): Promise<void>;
  openCompact(): Promise<boolean>;
  notify(text: string): Promise<void>;
  hotkeys: {
    set(bindings: HotkeyBindings): Promise<HotkeyResult>;
  };
  foreground: {
    /** starts (or stops) watching the foreground program; resolves with the current one */
    setActive(on: boolean): Promise<string | null>;
    onChange(cb: (exe: string | null) => void): Unsubscribe;
    listRunning(): Promise<RunningApp[]>;
  };
  sounds: {
    add(name: string, data: ArrayBuffer): Promise<string>;
    read(id: string): Promise<ArrayBuffer | null>;
    remove(id: string): Promise<void>;
  };
  remote: {
    get(): Promise<RemoteView>;
    setEnabled(on: boolean): Promise<RemoteView>;
    newCode(): Promise<RemoteView>;
    disconnect(id: string): Promise<void>;
    onDevices(cb: (devices: RemoteDevice[]) => void): Unsubscribe;
  };
  /** raw text of the community voice list, or null when it cannot be reached */
  communityVoices(): Promise<string | null>;
  quick: {
    onCommand(cb: (cmd: QuickCommand) => void): Unsubscribe;
    pushState(state: QuickState): void;
  };
  update: {
    check(): Promise<SimpleResult>;
    download(): Promise<SimpleResult>;
    onAvailable(cb: (info: UpdateInfo) => void): Unsubscribe;
    onNone(cb: () => void): Unsubscribe;
    onProgress(cb: (p: { percent: number }) => void): Unsubscribe;
    onDownloaded(cb: () => void): Unsubscribe;
    onError(cb: (message: string) => void): Unsubscribe;
  };
}

/** API exposed to the compact panel and the floating icon. */
export interface QuickApi {
  send(cmd: QuickCommand): void;
  onState(cb: (state: QuickState) => void): Unsubscribe;
  iconDrag(dx: number, dy: number): void;
  iconDragEnd(): void;
}
