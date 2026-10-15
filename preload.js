const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sesNative', {
  cfg: () => ipcRenderer.invoke('cfg'),
  setCfg: (c) => ipcRenderer.invoke('setCfg', c),
  appVersion: () => ipcRenderer.invoke('update:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  setKeys: (k) => ipcRenderer.send('keys', k),
  onCmd: (f) => ipcRenderer.on('cmd', (e, c) => f(c)),
  onGame: (f) => ipcRenderer.on('game', (e, g) => f(g))
});
