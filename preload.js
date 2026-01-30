const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuAction: (callback) => ipcRenderer.on('menu-action', callback),
  removeMenuActionListener: (callback) => ipcRenderer.removeListener('menu-action', callback)
});