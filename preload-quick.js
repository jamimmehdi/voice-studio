// Preload for the compact panel and the floating icon.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quick', {
  send: (cmd) => ipcRenderer.send('quick:cmd', cmd),
  onState: (cb) => {
    const handler = (_e, s) => cb(s);
    ipcRenderer.on('quick:state', handler);
    return () => ipcRenderer.removeListener('quick:state', handler);
  },
  iconDrag: (dx, dy) => ipcRenderer.send('icon:drag', { dx, dy }),
  iconDragEnd: () => ipcRenderer.send('icon:dragEnd'),
});
