const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('studio', {
  appInfo: () => ipcRenderer.invoke('app:info'),
  dspSource: () => ipcRenderer.invoke('dsp:source'),
  ytFetch: (url) => ipcRenderer.invoke('yt:fetch', url),
  saveFile: (name, data, filters) => ipcRenderer.invoke('file:save', { name, data, filters }),
  installVbCable: () => ipcRenderer.invoke('vbcable:install'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setShortcut: (accel) => ipcRenderer.invoke('settings:setShortcut', accel),
  },
  quitApp: () => ipcRenderer.invoke('app:quit'),
  openCompact: () => ipcRenderer.invoke('app:compact'),
  quick: {
    onCommand: on('quick:cmd'),
    pushState: (s) => ipcRenderer.send('quick:state', s),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    onAvailable: on('update:available'),
    onNone: on('update:none'),
    onProgress: on('update:progress'),
    onDownloaded: on('update:downloaded'),
    onError: on('update:error'),
  },
});
