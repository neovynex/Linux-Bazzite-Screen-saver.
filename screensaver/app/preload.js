const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saver', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: cfg => ipcRenderer.invoke('config:set', cfg),
  preview: cfg => ipcRenderer.invoke('saver:preview', cfg),
  serviceStatus: () => ipcRenderer.invoke('service:status'),
});
