import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type StudioApi, type Unsubscribe } from '@shared/ipc';

/** Subscribes to a main -> renderer channel and returns an unsubscribe function. */
function listen<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: StudioApi = {
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  dspSource: () => ipcRenderer.invoke(IPC.dspSource),
  ytFetch: (url) => ipcRenderer.invoke(IPC.ytFetch, url),
  saveFile: (name, data, filters) => ipcRenderer.invoke(IPC.fileSave, { name, data, filters }),
  installVbCable: () => ipcRenderer.invoke(IPC.vbcableInstall),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setShortcut: (accelerator) => ipcRenderer.invoke(IPC.settingsSetShortcut, accelerator),
  },
  quitApp: () => ipcRenderer.invoke(IPC.appQuit),
  openCompact: () => ipcRenderer.invoke(IPC.appCompact),
  notify: (text) => ipcRenderer.invoke(IPC.notify, text),
  hotkeys: {
    set: (bindings) => ipcRenderer.invoke(IPC.hotkeysSet, bindings),
  },
  foreground: {
    setActive: (on) => ipcRenderer.invoke(IPC.foregroundActive, on),
    onChange: (cb) => listen(IPC.foregroundChanged, cb),
    listRunning: () => ipcRenderer.invoke(IPC.appsRunning),
  },
  sounds: {
    add: (name, data) => ipcRenderer.invoke(IPC.soundsAdd, { name, data }),
    read: (id) => ipcRenderer.invoke(IPC.soundsRead, id),
    remove: (id) => ipcRenderer.invoke(IPC.soundsRemove, id),
  },
  remote: {
    get: () => ipcRenderer.invoke(IPC.remoteGet),
    setEnabled: (on) => ipcRenderer.invoke(IPC.remoteEnable, on),
    newCode: () => ipcRenderer.invoke(IPC.remoteNewCode),
    disconnect: (id) => ipcRenderer.invoke(IPC.remoteDisconnect, id),
    onDevices: (cb) => listen(IPC.remoteDevices, cb),
  },
  communityVoices: () => ipcRenderer.invoke(IPC.communityFetch),
  stateBackup: {
    write: (json) => ipcRenderer.send(IPC.stateBackupWrite, json),
    read: () => ipcRenderer.invoke(IPC.stateBackupRead),
  },
  quick: {
    onCommand: (cb) => listen(IPC.quickCmd, cb),
    pushState: (state) => ipcRenderer.send(IPC.quickState, state),
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    onAvailable: (cb) => listen(IPC.updateAvailable, cb),
    onNone: (cb) => listen<undefined>(IPC.updateNone, () => cb()),
    onProgress: (cb) => listen(IPC.updateProgress, cb),
    onDownloaded: (cb) => listen<undefined>(IPC.updateDownloaded, () => cb()),
    onError: (cb) => listen(IPC.updateError, cb),
  },
};

contextBridge.exposeInMainWorld('studio', api);
