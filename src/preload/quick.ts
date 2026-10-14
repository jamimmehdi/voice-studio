import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type QuickApi } from '@shared/ipc';
import type { QuickState } from '@shared/protocols';

const api: QuickApi = {
  send: (cmd) => ipcRenderer.send(IPC.quickCmd, cmd),
  onState: (cb) => {
    const handler = (_event: IpcRendererEvent, state: QuickState): void => cb(state);
    ipcRenderer.on(IPC.quickState, handler);
    return () => ipcRenderer.removeListener(IPC.quickState, handler);
  },
  iconDrag: (dx, dy) => ipcRenderer.send(IPC.iconDrag, { dx, dy }),
  iconDragEnd: () => ipcRenderer.send(IPC.iconDragEnd),
};

contextBridge.exposeInMainWorld('quick', api);
